const { pool } = require('../../config/db');

const getStats = async (req, res, next) => {
  try {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    /* ── CA du mois courant + mois précédent ── */
    const [[caRows]] = await pool.execute(
      `SELECT
         SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN total ELSE 0 END) AS revenue_month,
         SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN total ELSE 0 END) AS revenue_prev
       FROM orders
       WHERE status NOT IN ('cancelled', 'refunded')`,
      [month, year, month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year]
    );
    const revenueMonth = parseFloat(caRows.revenue_month ?? 0);
    const revenuePrev  = parseFloat(caRows.revenue_prev  ?? 0);
    const revenueTrend = revenuePrev > 0
      ? Math.round(((revenueMonth - revenuePrev) / revenuePrev) * 1000) / 10
      : null;

    /* ── Commandes de la semaine courante + semaine précédente ── */
    const [[ordersRows]] = await pool.execute(
      `SELECT
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END)  AS orders_week,
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                     AND created_at <  DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN 1 END) AS orders_prev_week,
         COUNT(CASE WHEN status IN ('pending','awaiting_payment') THEN 1 END)        AS orders_pending
       FROM orders`
    );
    const ordersWeek     = ordersRows.orders_week      ?? 0;
    const ordersPrevWeek = ordersRows.orders_prev_week ?? 0;
    const ordersPending  = ordersRows.orders_pending   ?? 0;
    const ordersTrend    = ordersPrevWeek > 0
      ? Math.round(((ordersWeek - ordersPrevWeek) / ordersPrevWeek) * 1000) / 10
      : null;

    /* ── Nouveaux clients (7 derniers jours vs 7 jours précédents) ── */
    const [[custRows]] = await pool.execute(
      `SELECT
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END)  AS customers_new,
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                     AND created_at <  DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN 1 END) AS customers_prev
       FROM users
       WHERE role = 'client' AND deleted_at IS NULL`
    );
    const customersNew  = custRows.customers_new  ?? 0;
    const customersPrev = custRows.customers_prev ?? 0;
    const customersTrend = customersPrev > 0
      ? Math.round(((customersNew - customersPrev) / customersPrev) * 1000) / 10
      : null;

    /* ── Note moyenne + avis en attente ── */
    const [[reviewRows]] = await pool.execute(
      `SELECT
         ROUND(AVG(CASE WHEN is_approved = 1 THEN rating END), 1) AS rating_avg,
         COUNT(CASE WHEN is_approved = 0 THEN 1 END)               AS rating_pending
       FROM reviews`
    );

    /* ── CA des 7 derniers mois ── */
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

    /* Normalise les barres en pourcentage par rapport au max */
    const maxRevenue = Math.max(...chartRows.map(r => parseFloat(r.revenue ?? 0)), 1);
    const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
    const chart = chartRows.map(r => ({
      month:   r.month_label,
      value:   parseFloat(r.revenue ?? 0),
      pct:     Math.round((parseFloat(r.revenue ?? 0) / maxRevenue) * 100),
      current: r.month_key === currentMonthKey,
    }));

    /* ── Top 5 produits du mois par CA ── */
    const [topRows] = await pool.execute(
      `SELECT
         p.id,
         pt.name,
         c.id AS category_id,
         ct.name AS category_name,
         ROUND(SUM(oi.unit_price * oi.quantity), 2) AS revenue
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
    const maxTopRevenue = parseFloat(topRows[0]?.revenue ?? 1);
    const topProducts = topRows.map(r => ({
      id:       r.id,
      name:     r.name ?? `Produit #${r.id}`,
      category: r.category_name ?? '—',
      revenue:  parseFloat(r.revenue ?? 0),
      pct:      Math.round((parseFloat(r.revenue ?? 0) / maxTopRevenue) * 100),
    }));

    /* ── Stock critique (≤ 5 unités) ── */
    const [lowStockRows] = await pool.execute(
      `SELECT p.id, pt.name, p.stock
       FROM products p
       LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
       WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.stock <= 5
       ORDER BY p.stock ASC
       LIMIT 10`
    );
    const lowStock = lowStockRows.map(r => ({
      id:     r.id,
      name:   r.name ?? `Produit #${r.id}`,
      stock:  r.stock,
      urgent: r.stock <= 2,
    }));

    /* ── Commandes récentes ── */
    const [recentOrders] = await pool.execute(
      `SELECT o.id, o.status, o.total, o.created_at,
              u.first_name, u.last_name, u.email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC
       LIMIT 8`
    );

    res.json({
      success: true,
      data: {
        stats: {
          revenue_month:   revenueMonth,
          revenue_trend:   revenueTrend,
          orders_week:     ordersWeek,
          orders_pending:  ordersPending,
          orders_trend:    ordersTrend,
          customers_new:   customersNew,
          customers_trend: customersTrend,
          rating_avg:      parseFloat(reviewRows.rating_avg ?? 0),
          rating_pending:  reviewRows.rating_pending ?? 0,
        },
        chart,
        top_products: topProducts,
        low_stock:    lowStock,
        recent_orders: recentOrders.map(o => ({
          id:             o.id,
          customer_name:  `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—',
          customer_email: o.email ?? '',
          status:         o.status,
          total:          parseFloat(o.total ?? 0),
          created_at:     o.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats };
