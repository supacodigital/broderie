const PDFDocument       = require('pdfkit');
const orderRepository   = require('../../repositories/order.repository');
const shippingService   = require('../../services/shipping.service');
const { pool }          = require('../../config/db');
const { AppError }      = require('../../middlewares/errorHandler');

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
      doc.fontSize(9).text('Rue du Simplon 12, 1006 Lausanne');
      doc.moveDown(0.8);

      doc.fontSize(8).text('DESTINATAIRE');
      doc.fontSize(12).font('Helvetica-Bold').text(`${order.first_name ?? ''} ${order.last_name ?? ''}`);
      doc.font('Helvetica').fontSize(10).text(order.street ?? '');
      doc.text(`${order.zip ?? ''} ${order.city ?? ''}`);
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

    /* Repli — URL externe (ancien format ou lien de suivi) */
    res.redirect(order.label_url);
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

    const [result] = await pool.execute(
      `UPDATE orders SET tracking_number = ? WHERE id = ?`,
      [tracking_number.trim(), orderId]
    );

    if (result.affectedRows === 0) return next(new AppError('Commande introuvable.', 404));

    res.json({ success: true, data: { tracking_number: tracking_number.trim() } });
  } catch (error) {
    next(error);
  }
};

module.exports = { generateLabel, downloadLabel, updateTracking };
