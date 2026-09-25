const { pool } = require('../config/db');
const { stockScaleSql } = require('../utils/length.utils');

/* Statuts comptant comme chiffre d'affaires : uniquement l'encaissé.
   Les statuts antérieurs au paiement (pending, awaiting_payment, pending_invoice,
   pending_pickup) en sont exclus — une facture émise n'est pas un encaissement.
   Constante partagée par le CA, le graphique et le top produits : ces trois chiffres
   doivent reposer sur la même définition, sinon ils se contredisent à l'écran. */
const REVENUE_STATUSES = `('paid', 'processing', 'ready_for_pickup', 'shipped', 'delivered')`;

/* Passages en caisse carte / Twint jamais payés (CLI-07) : commande en attente
   de paiement, refusée par la banque, ou annulée faute de paiement. Ce ne sont
   pas des ventes — les compter gonflait « commandes de la semaine » et
   « en attente » à chaque carte refusée. Critère unique : `confirmed_at`, posé
   à la création pour la facture et le retrait, au paiement pour la carte et
   Twint — le même que la liste des commandes. */
const ABANDONED_ONLINE_SQL = `(o.confirmed_at IS NULL)`;

const getStats = async ({ month, year }) => {
  /* Le montant facturé non encore réglé est suivi à part, via invoices_unpaid_total. */
  const [[caRows]] = await pool.execute(
    `SELECT
       SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN total ELSE 0 END) AS revenue_month,
       SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN total ELSE 0 END) AS revenue_prev
     FROM orders
     WHERE status IN ${REVENUE_STATUSES}`,
    [month, year, month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year]
  );

  const [[ordersRows]] = await pool.execute(
    `SELECT
       COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END)  AS orders_week,
       COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                   AND created_at <  DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN 1 END) AS orders_prev_week,
       /* « En attente » inclut pending_invoice : c'est le statut d'une facture émise
          et non réglée, donc le mode de paiement principal de la boutique. L'omettre
          revenait à ne jamais compter les commandes qui attendent un virement. */
       COUNT(CASE WHEN status IN ('pending','pending_invoice') THEN 1 END)        AS orders_pending,
       /* Encours client : montant facturé non encaissé, et son ancienneté. Sert à
          savoir quoi relancer — le CA seul ne dit pas ce qui reste à encaisser. */
       COUNT(CASE WHEN status = 'pending_invoice' THEN 1 END)                     AS invoices_unpaid,
       COALESCE(SUM(CASE WHEN status = 'pending_invoice' THEN total END), 0)      AS invoices_unpaid_total,
       COUNT(CASE WHEN status = 'pending_invoice'
                   AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END)  AS invoices_overdue
     FROM orders o
     WHERE NOT ${ABANDONED_ONLINE_SQL}`
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
     WHERE status IN ${REVENUE_STATUSES}
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
       AND o.status IN ${REVENUE_STATUSES}
     GROUP BY p.id, pt.name, c.id, ct.name
     ORDER BY revenue DESC
     LIMIT 5`,
    [month, year]
  );
  return topRows;
};

const getLowStock = async () => {
  const [rows] = await pool.execute(
    `SELECT p.id, pt.name, p.stock, p.sold_by_length,
            (SELECT COALESCE(pi.url_thumbnail, REPLACE(pi.url, '-large.webp', '-thumbnail.webp'), pi.url) FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_primary = 1
             LIMIT 1) AS image_url
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
     /* Seuil en unité de vente : 5 pièces, ou 5 m pour un article à la coupe
        dont le stock compte des centimètres (ADM-12). */
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.stock <= 5 * ${stockScaleSql('p')}
       /* Exclut les articles « sur commande », à 0 par nature : sans ce filtre
          l'encart listait dix d'entre eux et ne montrait jamais un vrai réassort. */
       AND p.is_made_to_order = 0
     ORDER BY p.stock / ${stockScaleSql('p')} ASC
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
     -- Sans les tentatives de paiement carte / Twint non abouties (CLI-07)
     WHERE NOT ${ABANDONED_ONLINE_SQL}
     ORDER BY o.created_at DESC
     LIMIT 8`
  );
  return rows;
};

module.exports = { getStats, getChart, getTopProducts, getLowStock, getRecentOrders };
