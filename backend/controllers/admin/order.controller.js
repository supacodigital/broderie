const orderRepository   = require('../../repositories/order.repository');
const userRepository    = require('../../repositories/user.repository');
const { pool }          = require('../../config/db');
const { AppError }      = require('../../middlewares/errorHandler');
const emailService      = require('../../services/email.service');
const shippingService   = require('../../services/shipping.service');
const loyaltyService    = require('../../services/loyalty.service');
const { generateInvoicePDF } = require('../../services/invoice.service');

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
  const connection = await pool.getConnection();
  try {
    const orderId = parseInt(req.params.id);
    const { status, note } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      connection.release();
      return next(new AppError(`Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}`, 400));
    }

    await connection.beginTransaction();

    const [existing] = await connection.execute(
      `SELECT id FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    if (!existing[0]) {
      await connection.rollback();
      connection.release();
      return next(new AppError('Commande introuvable.', 404));
    }

    // Mise à jour du statut + historique dans la même transaction
    await connection.execute(
      `UPDATE orders SET status = ? WHERE id = ?`,
      [status, orderId]
    );
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, ?, ?, ?)`,
      [orderId, status, note || null, req.user.id]
    );

    await connection.commit();
    connection.release();

    const order = await orderRepository.findById(orderId);

    // Génération étiquette Swiss Post + email client — non bloquants
    userRepository.findById(order.user_id).then(async (user) => {
      if (!user) return;

      if (status === 'shipped') {
        /* Génération automatique de l'étiquette si aucun tracking existant */
        let trackingNumber = order.tracking_number ?? null;

        if (!trackingNumber && order.street) {
          try {
            const label = await shippingService.generateLabel(orderId, order);
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
        emailService.sendOrderStatusUpdate({ user, order, newStatus: status }).catch((err) => {
          console.error('[Email] Statut non envoyé :', err.message);
        });

        // Débit fidélité uniquement si la commande avait été payée
        if (status === 'refunded' || (status === 'cancelled' && ['paid', 'processing', 'shipped', 'delivered'].includes(order.status))) {
          loyaltyService.processRefund(order.user_id, order.id, order.total).catch((err) => {
            console.error('[Fidélité] Débit remboursement échoué :', err.message);
          });
        }
      }
    }).catch(() => {});

    res.json({ success: true, data: order });
  } catch (error) {
    await connection.rollback();
    connection.release();
    next(error);
  }
};

const downloadInvoice = async (req, res, next) => {
  try {
    const order = await orderRepository.findById(parseInt(req.params.id));
    if (!order) return next(new AppError('Commande introuvable.', 404));

    const user = await userRepository.findById(order.user_id);
    if (!user) return next(new AppError('Client introuvable.', 404));

    const pdfBuffer = await generateInvoicePDF({ order, user });

    const filename = `facture-${String(order.id).padStart(6, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, updateStatus, downloadInvoice };
