const { pool } = require('../config/db');

const getStats = async ({ month, year }) => {
  const [[caRows]] = await pool.execute(
    `SELECT
       SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN total ELSE 0 END) AS revenue_month,
       SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN total ELSE 0 END) AS revenue_prev
     FROM orders
     WHERE status NOT IN ('cancelled', 'refunded')`,
    [month, year, month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year]
  );

  const [[ordersRows]] = await pool.execute(
    `SELECT
       COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END)  AS orders_week,
       COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                   AND created_at <  DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN 1 END) AS orders_prev_week,
       COUNT(CASE WHEN status IN ('pending','awaiting_payment') THEN 1 END)        AS orders_pending
     FROM orders`
  );

  const [[custRows]] = await pool.execute(
    `SELECT
       COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END)  AS customers_new,
       COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                   AND created_at <  DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN 1 END) AS customers_prev
     FROM users
     WHERE role = 'client' AND deleted_at IS NULL`
  );

  const [[reviewRows]] = await pool.execute(
    `SELECT
       ROUND(AVG(CASE WHEN is_approved = 1 THEN rating END), 1) AS rating_avg,
       COUNT(CASE WHEN is_approved = 0 THEN 1 END)               AS rating_pending
     FROM reviews`
  );

  return { caRows, ordersRows, custRows, reviewRows };
};

const getChart = async () => {
  const [chartRows] = await pool.execute(
    `SELECT
       DATE_FORMAT(created_at, '%Y-%m') AS month_key,
       DATE_FORMAT(created_at, '%b')    AS month_label,
       ROUND(SUM(total), 2)             AS revenue
     FROM orders
     WHERE status NOT IN ('cancelled','refunded')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 MONTH)
     GROUP BY month_key, month_label
     ORDER BY month_key ASC`
  );
  return chartRows;
};

const getTopProducts = async ({ month, year }) => {
  const [topRows] = await pool.execute(
    `SELECT
       p.id,
       pt.name,
       c.id AS category_id,
       ct.name AS category_name,
       ROUND(SUM(oi.unit_price * oi.quantity), 2) AS revenue,
       (SELECT COALESCE(pi.url_thumbnail, REPLACE(pi.url, '-large.webp', '-thumbnail.webp'), pi.url) FROM product_images pi
        WHERE pi.product_id = p.id AND pi.is_primary = 1
        LIMIT 1) AS image_url
     FROM order_items oi
     INNER JOIN orders o   ON o.id = oi.order_id
     INNER JOIN products p ON p.id = oi.product_id
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
     LEFT JOIN categories c   ON c.id = p.category_id
     LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
     WHERE MONTH(o.created_at) = ? AND YEAR(o.created_at) = ?
       AND o.status NOT IN ('cancelled','refunded')
     GROUP BY p.id, pt.name, c.id, ct.name
     ORDER BY revenue DESC
     LIMIT 5`,
    [month, year]
  );
  return topRows;
};

const getLowStock = async () => {
  const [rows] = await pool.execute(
    `SELECT p.id, pt.name, p.stock,
            (SELECT COALESCE(pi.url_thumbnail, REPLACE(pi.url, '-large.webp', '-thumbnail.webp'), pi.url) FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_primary = 1
             LIMIT 1) AS image_url
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.stock <= 5
     ORDER BY p.stock ASC
     LIMIT 10`
  );
  return rows;
};

const getRecentOrders = async () => {
  const [rows] = await pool.execute(
    `SELECT o.id, o.status, o.total, o.created_at,
            u.first_name, u.last_name, u.email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC
     LIMIT 8`
  );
  return rows;
};

module.exports = { getStats, getChart, getTopProducts, getLowStock, getRecentOrders };
