const PDFDocument       = require('pdfkit');
const orderRepository   = require('../../repositories/order.repository');
const shippingService   = require('../../services/shipping.service');
const { AppError }      = require('../../middlewares/errorHandler');

// Préfixes autorisés pour label_url avant tout res.redirect — évite un open redirect
// piloté par le contenu de orders.label_url.
const SAFE_LABEL_URL = /^https:\/\/(www\.)?post\.ch\//i;

/**
 * Génère manuellement une étiquette La Poste CH pour une commande.
 * Sauvegarde tracking_number, label_url, label_id dans orders.
 */
const generateLabel = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await orderRepository.findById(orderId);
    if (!order) return next(new AppError('Commande introuvable.', 404));

    const label = await shippingService.generateLabel(orderId, order);

    res.json({
      success: true,
      data: {
        trackingNumber: label.trackingNumber,
        labelUrl:       label.labelUrl,
        labelId:        label.labelId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Génère et retourne un PDF d'étiquette pour la commande.
 * En mode réel : proxy vers l'URL stockée en base.
 * En mode mock : génère un PDF d'étiquette factice avec pdfkit.
 */
const downloadLabel = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await orderRepository.findById(orderId);
    if (!order) return next(new AppError('Commande introuvable.', 404));
    if (!order.label_id) return next(new AppError('Aucune étiquette disponible — générez-la d\'abord.', 404));

    const isMock = !order.label_id || order.label_id.startsWith('mock-');

    if (isMock) {
      /* Génération d'un PDF d'étiquette factice via pdfkit */
      const doc = new PDFDocument({ size: 'A6', margin: 20 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="etiquette-${String(orderId).padStart(6, '0')}.pdf"`);
      doc.pipe(res);

      doc.fontSize(10).text('ÉTIQUETTE D\'EXPÉDITION — MODE SIMULATION', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(20, doc.y).lineTo(400, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(8).text('EXPÉDITEUR');
      doc.fontSize(10).text('Au Point-Compté');
      doc.fontSize(9).text('Rue de Vuarrengel 10, 1418 Vuarrens');
      doc.moveDown(0.8);

      doc.fontSize(8).text('DESTINATAIRE');
      /* Destinataire figé au moment de la commande (peut différer du titulaire du compte) */
      doc.fontSize(12).font('Helvetica-Bold').text(`${order.shipping_first_name ?? order.first_name ?? ''} ${order.shipping_last_name ?? order.last_name ?? ''}`);
      doc.font('Helvetica').fontSize(10).text([order.shipping_street, order.shipping_street_number].filter(Boolean).join(' '));
      doc.text(`${order.shipping_zip ?? ''} ${order.shipping_city ?? ''}`);
      doc.text('Suisse');
      doc.moveDown(0.8);

      doc.moveTo(20, doc.y).lineTo(400, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(8).text('N° DE SUIVI');
      doc.fontSize(14).font('Helvetica-Bold').text(order.tracking_number ?? '—', { align: 'center' });
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(7).text('[Mode simulation — en attente des accès API La Poste CH]', { align: 'center', color: '#999' });

      doc.end();
      return;
    }

    /* Mode réel — l'étiquette PDF est stockée en data URI base64 dans label_url */
    if (order.label_url?.startsWith('data:application/pdf;base64,')) {
      const base64 = order.label_url.split(',')[1] ?? '';
      const pdfBuffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="etiquette-${String(orderId).padStart(6, '0')}.pdf"`);
      return res.send(pdfBuffer);
    }

    /* Repli — URL externe (ancien format ou lien de suivi Post.ch uniquement) */
    if (order.label_url && SAFE_LABEL_URL.test(order.label_url)) {
      return res.redirect(order.label_url);
    }
    return next(new AppError('Format d\'étiquette non pris en charge.', 400));
  } catch (error) {
    next(error);
  }
};

/**
 * Saisie manuelle du numéro de suivi par l'admin.
 */
const updateTracking = async (req, res, next) => {
  try {
    const orderId       = parseInt(req.params.id);
    const { tracking_number } = req.body;

    if (!tracking_number || typeof tracking_number !== 'string' || !tracking_number.trim()) {
      return next(new AppError('Le numéro de suivi est requis.', 400));
    }

    const trimmed = tracking_number.trim();
    const ok = await orderRepository.updateTrackingNumber(orderId, trimmed);
    if (!ok) return next(new AppError('Commande introuvable.', 404));

    res.json({ success: true, data: { tracking_number: trimmed } });
  } catch (error) {
    next(error);
  }
};

module.exports = { generateLabel, downloadLabel, updateTracking };
