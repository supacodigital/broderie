const orderRepository   = require('../../repositories/order.repository');
const userRepository    = require('../../repositories/user.repository');
const { pool }          = require('../../config/db');
const { AppError }      = require('../../middlewares/errorHandler');
const emailService      = require('../../services/email.service');
const shippingService   = require('../../services/shipping.service');
const loyaltyService    = require('../../services/loyalty.service');

// Statuts valides — alignés avec l'ENUM du schema
const VALID_STATUSES = ['pending', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

const getAll = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const q      = req.query.q?.trim() || null;

    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    if (q) {
      /* Recherche par ID numérique ou par nom/email client */
      if (/^\d+$/.test(q)) {
        conditions.push('o.id = ?');
        params.push(parseInt(q));
      } else {
        conditions.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       ${where}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.tax_amount, o.total,
              o.created_at, o.updated_at,
              u.email, u.first_name, u.last_name
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

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
        /* Génération étiquette ShipEngine si l'adresse de livraison est disponible */
        let trackingNumber = note?.match(/[A-Z0-9]{10,}/)?.[0] ?? null;

        if (!trackingNumber && order.shipping_address) {
          try {
            const label = await shippingService.createLabel({
              order,
              address: order.shipping_address,
            });
            trackingNumber = label.trackingNumber;

            /* Sauvegarde du numéro de suivi dans la commande */
            await pool.execute(
              `UPDATE orders SET tracking_number = ? WHERE id = ?`,
              [trackingNumber, orderId]
            );
          } catch (err) {
            console.error('[ShipEngine] Étiquette non générée :', err.message);
          }
        }

        emailService.sendOrderShipped({ user, order, trackingNumber }).catch((err) => {
          console.error('[Email] Expédition non envoyée :', err.message);
        });

      } else if (['paid', 'delivered', 'cancelled', 'refunded'].includes(status)) {
        emailService.sendOrderStatusUpdate({ user, order, newStatus: status }).catch((err) => {
          console.error('[Email] Statut non envoyé :', err.message);
        });

        if (status === 'delivered') {
          loyaltyService.processOrderEarning(order.user_id, order.id, order.total).catch((err) => {
            console.error('[Fidélité] Crédit livraison échoué :', err.message);
          });
        }

        if (status === 'refunded' || status === 'cancelled') {
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

module.exports = { getAll, getById, updateStatus };
