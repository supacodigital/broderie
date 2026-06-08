const { pool } = require('../config/db');

// Création d'une commande — transaction atomique (stock + commande + items + coupon + paiement)
const createOrder = async ({ userId, items, subtotal, shippingCost, taxAmount, total, status = 'pending', address = null, couponCode = null, discount = 0, couponId = null, paymentMethod = 'twint', qrReference = null }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Vérification et décrémentation du stock pour chaque article (atomique)
    for (const item of items) {
      const [rows] = await connection.execute(
        `SELECT stock, is_made_to_order FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL FOR UPDATE`,
        [item.product_id]
      );
      if (!rows[0]) {
        throw new Error(`Produit introuvable #${item.product_id}`);
      }
      // Produit sur commande : pas de contrôle ni de décrémentation de stock (fabriqué à la demande)
      if (rows[0].is_made_to_order) continue;
      if (rows[0].stock < item.quantity) {
        throw new Error(`Stock insuffisant pour le produit #${item.product_id}`);
      }
      await connection.execute(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // Création de la commande avec adresse de livraison figée
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
         (user_id, status, subtotal, discount, coupon_code, shipping_cost, tax_amount, total, qr_reference,
          shipping_street, shipping_city, shipping_zip, shipping_country, shipping_canton)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, status, subtotal, discount, couponCode, shippingCost, taxAmount, total, qrReference,
        address?.street  ?? null,
        address?.city    ?? null,
        address?.zip     ?? null,
        address?.country ?? 'CH',
        address?.canton  ?? null,
      ]
    );
    const orderId = orderResult.insertId;

    // Insertion des articles avec snapshot produit figé
    for (const item of items) {
      const [productRows] = await connection.execute(
        `SELECT p.price_chf, p.sku, p.weight_kg, p.is_made_to_order, pt.name, pt.description
         FROM products p
         INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
         WHERE p.id = ?`,
        [item.product_id]
      );
      const product = productRows[0];

      await connection.execute(
        `INSERT INTO order_items
           (order_id, product_id, variant_id, quantity, unit_price, tax_rate_snapshot, product_snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.variant_id || null,
          item.quantity,
          item.price_snapshot,
          item.tax_rate_snapshot,
          // Snapshot figé du produit — inclut le flag « sur commande » pour l'affichage email/commande
          JSON.stringify({ name: product.name, sku: product.sku, description: product.description, is_made_to_order: !!product.is_made_to_order }),
        ]
      );
    }

    // Historique de statut initial
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, ?, 'Commande créée', ?)`,
      [orderId, status, userId]
    );

    // Enregistrement du paiement initial — dans la même transaction
    await connection.execute(
      `INSERT INTO payments (order_id, provider, amount, currency, method, status)
       VALUES (?, 'stripe', ?, 'CHF', ?, 'pending')`,
      [orderId, total, paymentMethod]
    );

    // Incrémentation du coupon — dans la même transaction
    if (couponId) {
      await connection.execute(
        `UPDATE coupons SET used_count = used_count + 1 WHERE id = ?`,
        [couponId]
      );
    }

    await connection.commit();
    return orderId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Liste des commandes d'un utilisateur
const findByUserId = async (userId, { page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM orders WHERE user_id = ?`,
    [userId]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.tax_amount, o.total,
            o.created_at, o.updated_at,
            COUNT(oi.id) AS items_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ?
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return { rows, total };
};

// Détail d'une commande avec ses articles
const findById = async (orderId, userId = null) => {
  const conditions = ['o.id = ?'];
  const params = [orderId];

  // Un client ne peut voir que ses propres commandes — un admin peut tout voir
  if (userId) {
    conditions.push('o.user_id = ?');
    params.push(userId);
  }

  const [orders] = await pool.execute(
    `SELECT o.id, o.status, o.subtotal, o.discount, o.coupon_code, o.shipping_cost, o.tax_amount, o.total,
            o.qr_reference,
            o.created_at, o.updated_at, o.user_id,
            o.shipping_street AS street, o.shipping_city AS city,
            o.shipping_zip    AS zip,    o.shipping_country AS country,
            o.shipping_canton AS canton,
            o.tracking_number, o.label_url, o.label_id,
            u.first_name, u.last_name, u.email
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params
  );

  if (!orders[0]) return null;

  const [items] = await pool.execute(
    `SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
            oi.unit_price, oi.tax_rate_snapshot, oi.product_snapshot_json
     FROM order_items oi
     WHERE oi.order_id = ?`,
    [orderId]
  );

  const [history] = await pool.execute(
    `SELECT status, note, created_at
     FROM order_status_history
     WHERE order_id = ?
     ORDER BY created_at ASC`,
    [orderId]
  );

  // Méthode de paiement depuis la table payments
  const [payments] = await pool.execute(
    `SELECT method FROM payments WHERE order_id = ? ORDER BY created_at ASC LIMIT 1`,
    [orderId]
  );

  return {
    ...orders[0],
    payment_method: payments[0]?.method ?? null,
    items: items.map((i) => ({
      ...i,
      product_snapshot_json: typeof i.product_snapshot_json === 'string'
        ? JSON.parse(i.product_snapshot_json)
        : i.product_snapshot_json,
    })),
    history,
  };
};

const VALID_STATUSES = ['pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const ALLOWED_SORT   = { created_at: 'o.created_at', total: 'o.total' };

const findAllAdmin = async ({ page = 1, limit = 20, sort = 'created_at', order = 'desc', status = null, q = null } = {}) => {
  const offset    = (page - 1) * limit;
  const sortField = ALLOWED_SORT[sort] || 'o.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const params = [];
  const conditions = [];

  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s));
    if (statuses.length === 1) {
      conditions.push('o.status = ?');
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`o.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (q) {
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
    `SELECT COUNT(*) AS total FROM orders o INNER JOIN users u ON u.id = o.user_id ${where}`,
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
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
};

module.exports = { createOrder, findByUserId, findById, findAllAdmin };
