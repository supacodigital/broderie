const orderRepository   = require('../../repositories/order.repository');
const userRepository    = require('../../repositories/user.repository');
const { AppError }      = require('../../middlewares/errorHandler');
const emailService      = require('../../services/email.service');
const shippingService   = require('../../services/shipping.service');
const loyaltyService    = require('../../services/loyalty.service');
const paymentService    = require('../../services/payment.service');
const orderService      = require('../../services/order.service');
const { generateInvoicePDF } = require('../../services/invoice.service');
const shopSettingsService = require('../../services/shopSettings.service');

// Statuts valides — alignés avec l'ENUM du schema
const VALID_STATUSES = ['pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

const getAll = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const { rows, total } = await orderRepository.findAllAdmin({
      page,
      limit,
      sort:   req.query.sort   || 'created_at',
      order:  req.query.order  || 'desc',
      status: req.query.status || null,
      q:      req.query.q?.trim() || null,
      // Vue « Paiements non aboutis » : tentatives carte / Twint jamais payées (CLI-07)
      attempts: req.query.attempts === '1',
      // Période — format AAAA-MM-JJ, validé ici pour ne pas passer n'importe quoi au SQL
      dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(req.query.date_from ?? '') ? req.query.date_from : null,
      dateTo:   /^\d{4}-\d{2}-\d{2}$/.test(req.query.date_to   ?? '') ? req.query.date_to   : null,
    });

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const order = await orderRepository.findById(parseInt(req.params.id));
    if (!order) return next(new AppError('Commande introuvable.', 404));
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status, note } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return next(new AppError(`Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}`, 400));
    }

    /* Mode d'envoi au passage en « Expédiée » (ADM-10) : étiquette PostPac
       Economy ou Priority générée automatiquement, ou « NONE » pour un envoi
       déjà affranchi ailleurs (WebStamp). Sans ce choix, un envoi affranchi sur
       WebStamp déclenchait en plus une vraie étiquette Priority, facturée. */
    const shippingMethod = req.body.shippingMethod ?? 'PRI';
    if (status === 'shipped' && shippingMethod !== 'NONE' && !shippingService.isLabelProduct(shippingMethod)) {
      return next(new AppError('Mode d\'envoi invalide — PostPac Economy, Priority ou déjà affranchi.', 400));
    }

    // previousStatus vient du repository : l'objet relu juste après porte déjà le NOUVEAU
    // statut, il ne peut donc pas servir à savoir d'où venait la commande.
    const { ok, previousStatus } = await orderRepository.updateStatusWithHistory(orderId, status, note, req.user.id);
    if (!ok) return next(new AppError('Commande introuvable.', 404));

    let order = await orderRepository.findById(orderId);

    /* Tentative carte / Twint que la boutique fait avancer à la main (réglée par
       un autre moyen, par exemple) : devenue une vraie commande, elle reçoit son
       numéro de facture, attribué d'ordinaire au paiement en ligne (CLI-07). */
    if (order.confirmed_at && !order.invoice_number) {
      await orderService.numberInvoice(orderId);
      order = await orderRepository.findById(orderId);
    }

    // Génération étiquette Swiss Post + email client — non bloquants
    userRepository.findById(order.user_id).then(async (user) => {
      if (!user) return;

      if (status === 'shipped') {
        /* Génération automatique de l'étiquette si aucun tracking existant */
        let trackingNumber = order.tracking_number ?? null;

        if (!trackingNumber && order.shipping_street && shippingMethod !== 'NONE') {
          try {
            const label = await shippingService.generateLabel(orderId, order, { product: shippingMethod });
            trackingNumber = label.trackingNumber;
          } catch (err) {
            console.error('[La Poste CH] Étiquette non générée :', err.message);
          }
        }

        emailService.sendOrderShipped({ user, order, trackingNumber }).catch((err) => {
          console.error('[Email] Expédition non envoyée :', err.message);
        });

      } else if (status === 'ready_for_pickup') {
        /* Click & Collect : email automatique « votre commande est prête » avec adresse + horaires boutique */
        emailService.sendPickupReady({ user, order }).catch((err) => {
          console.error('[Email] Commande prête non envoyée :', err.message);
        });

      } else if (['paid', 'delivered', 'cancelled', 'refunded'].includes(status)) {
        // Crédit fidélité au passage à « payée » — le webhook Stripe ne couvre que
        // card/twint ; les commandes MVP (facture QR, retrait) sont marquées payées
        // manuellement ici et n'accumuleraient jamais rien sans cet appel.
        if (status === 'paid' && previousStatus !== 'paid') {
          loyaltyService.processOrderEarning(order.user_id, order.id, order.total).catch((err) => {
            console.error('[Fidélité] Crédit points échoué :', err.message);
          });
        }

        // Débit fidélité uniquement si la commande avait réellement été payée avant
        // ce changement de statut (previousStatus, pas order.status qui est déjà à jour).
        const wasPaid = ['paid', 'processing', 'shipped', 'delivered'].includes(previousStatus);
        if ((status === 'refunded' || status === 'cancelled') && wasPaid) {
          loyaltyService.processRefund(order.user_id, order.id, order.total).catch((err) => {
            console.error('[Fidélité] Débit remboursement échoué :', err.message);
          });
        }
      }
    }).catch(() => {});

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const downloadInvoice = async (req, res, next) => {
  try {
    const order = await orderRepository.findById(parseInt(req.params.id));
    if (!order) return next(new AppError('Commande introuvable.', 404));

    const user = await userRepository.findById(order.user_id);
    if (!user) return next(new AppError('Client introuvable.', 404));

    /* Coordonnées d'émetteur et délai de paiement saisis dans l'admin
       (Paramètres → Facturation), avec repli sur la configuration serveur. */
    const invoiceSettings = await shopSettingsService.getInvoiceSettings();
    const pdfBuffer = await generateInvoicePDF({ order, user, settings: invoiceSettings });

    const filename = `facture-${String(order.id).padStart(6, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// Génère un QR Twint pour la commande et l'envoie par email au client (voir CLAUDE.md §5)
const sendTwintQr = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await orderRepository.findById(orderId);
    if (!order) return next(new AppError('Commande introuvable.', 404));

    const user = await userRepository.findById(order.user_id);
    if (!user) return next(new AppError('Client introuvable.', 404));

    const { qrBuffer, payUrl, expiresAt } = await paymentService.createTwintQrForEmail(orderId);
    await emailService.sendTwintQrEmail({ user, order, qrBuffer, payUrl, expiresAt });

    res.json({ success: true, message: 'QR Twint envoyé par email.' });
  } catch (error) {
    next(error);
  }
};

// Détail de la transaction : moyen, encaissement, frais, tentatives (Stripe + base)
const getPayment = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) return next(new AppError('Commande introuvable.', 404));
    const data = await paymentService.getOrderTransaction(orderId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, updateStatus, downloadInvoice, sendTwintQr, getPayment };
