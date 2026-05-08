const { pool } = require('../config/db');

// Création d'une commande — transaction atomique (stock + commande + items)
const createOrder = async ({ userId, items, subtotal, shippingCost, taxAmount, total, status = 'pending', addressId, couponCode = null, discount = 0 }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Vérification et décrémentation du stock pour chaque article (atomique)
    for (const item of items) {
      const [rows] = await connection.execute(
        `SELECT stock FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL FOR UPDATE`,
        [item.product_id]
      );
      if (!rows[0] || rows[0].stock < item.quantity) {
        throw new Error(`Stock insuffisant pour le produit #${item.product_id}`);
      }
      await connection.execute(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // Création de la commande
    const [orderResult] = await connection.execute(
      `INSERT INTO orders (user_id, status, subtotal, discount, coupon_code, shipping_cost, tax_amount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, status, subtotal, discount, couponCode, shippingCost, taxAmount, total]
    );
    const orderId = orderResult.insertId;

    // Insertion des articles avec snapshot produit figé
    for (const item of items) {
      const [productRows] = await connection.execute(
        `SELECT p.price_chf, p.sku, p.weight_kg, pt.name, pt.description
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
          JSON.stringify({ name: product.name, sku: product.sku, description: product.description }),
        ]
      );
    }

    // Historique de statut initial
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, ?, 'Commande créée', ?)`,
      [orderId, status, userId]
    );

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
     LIMIT ${limit} OFFSET ${offset}`,
    [userId]
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
    `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.tax_amount, o.total,
            o.created_at, o.updated_at, o.user_id,
            u.first_name, u.last_name, u.email,
            a.street, a.city, a.zip, a.country, a.canton
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     LEFT JOIN addresses a ON a.user_id = o.user_id AND a.is_default = 1
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

module.exports = { createOrder, findByUserId, findById };
