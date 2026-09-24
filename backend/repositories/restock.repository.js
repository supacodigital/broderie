const { pool } = require('../config/db');

/* État des réassorts fournisseurs — ticket ADM-09.

   Deux sources d'articles à commander, regroupées par fournisseur :
     1. les articles « sur commande » demandés par des commandes clientes en
        cours : la boutique ne les a pas, il faut les commander pour livrer ;
     2. les articles tenus en stock dont le stock est bas (≤ LOW_STOCK_THRESHOLD),
        même seuil que le filtre « stock bas » et le tableau de bord.
   Lecture seule : la cliente passe ses commandes fournisseurs comme aujourd'hui. */

const LOW_STOCK_THRESHOLD = 5;
const MAX_ITEMS = 1000; // une liste de commande fournisseur ne dépasse pas ce volume

/* Commandes dont les articles restent à fournir. Les paiements carte / Twint
   non aboutis (awaiting_payment, payment_failed) sont exclus : ces commandes
   s'annulent d'elles-mêmes, rien n'est à commander pour elles. Une commande
   « prête au retrait », expédiée ou livrée a déjà ses articles. */
const OPEN_ORDER_STATUSES = ['pending', 'pending_invoice', 'pending_pickup', 'paid', 'processing'];

/* Article commandé « sur commande » : l'état figé dans la commande fait foi
   (product_snapshot_json), la fiche produit sert de repli aux lignes anciennes. */
const MADE_TO_ORDER_SQL = `(
  JSON_UNQUOTE(JSON_EXTRACT(oi.product_snapshot_json, '$.is_made_to_order')) = 'true'
  OR (JSON_EXTRACT(oi.product_snapshot_json, '$.is_made_to_order') IS NULL AND p.is_made_to_order = 1)
)`;

// Filtre fournisseur : un identifiant, ou `null` pour les articles sans fournisseur
const supplierFilter = (supplierId) => (supplierId === null
  ? { sql: 'p.supplier_id IS NULL', params: [] }
  : { sql: 'p.supplier_id = ?', params: [supplierId] });

/* Synthèse par fournisseur : nombre d'articles demandés par des commandes et
   nombre d'articles en stock bas. Trois requêtes agrégées, aucune par fournisseur. */
const summaryBySupplier = async () => {
  const statusPlaceholders = OPEN_ORDER_STATUSES.map(() => '?').join(', ');
  const [demand] = await pool.query(
    `SELECT p.supplier_id, COUNT(DISTINCT oi.product_id) AS demand_items, SUM(oi.quantity) AS demand_qty
     FROM order_items oi
     JOIN orders o   ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE o.status IN (${statusPlaceholders}) AND ${MADE_TO_ORDER_SQL}
     GROUP BY p.supplier_id`,
    OPEN_ORDER_STATUSES
  );
  const [low] = await pool.query(
    `SELECT p.supplier_id, COUNT(*) AS low_stock_items
     FROM products p
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.is_made_to_order = 0 AND p.stock <= ?
     GROUP BY p.supplier_id`,
    [LOW_STOCK_THRESHOLD]
  );
  const ids = [...new Set([...demand, ...low].map((r) => r.supplier_id).filter((id) => id !== null))];
  const [suppliers] = ids.length
    ? await pool.query('SELECT id, name, is_active FROM suppliers WHERE id IN (?)', [ids])
    : [[]];
  return { demand, low, suppliers };
};

/* Lignes à commander chez un fournisseur. Retourne les deux listes brutes et
   les noms d'articles (lus à part : jamais plus de trois tables par requête). */
const itemsForSupplier = async (supplierId) => {
  const filter = supplierFilter(supplierId);
  const statusPlaceholders = OPEN_ORDER_STATUSES.map(() => '?').join(', ');

  const [demand] = await pool.query(
    `SELECT oi.product_id, SUM(oi.quantity) AS ordered_qty,
            GROUP_CONCAT(DISTINCT o.id ORDER BY o.id SEPARATOR ',') AS order_ids,
            MIN(o.created_at) AS first_order_at
     FROM order_items oi
     JOIN orders o   ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE o.status IN (${statusPlaceholders}) AND ${MADE_TO_ORDER_SQL} AND ${filter.sql}
     GROUP BY oi.product_id
     ORDER BY first_order_at ASC
     LIMIT ?`,
    [...OPEN_ORDER_STATUSES, ...filter.params, MAX_ITEMS]
  );
  const [low] = await pool.query(
    `SELECT p.id AS product_id
     FROM products p
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.is_made_to_order = 0
       AND p.stock <= ? AND ${filter.sql}
     ORDER BY p.stock ASC, p.id ASC
     LIMIT ?`,
    [LOW_STOCK_THRESHOLD, ...filter.params, MAX_ITEMS]
  );

  const productIds = [...new Set([...demand, ...low].map((r) => r.product_id))];
  const [products] = productIds.length
    ? await pool.query(
      `SELECT p.id, p.sku, p.stock, p.is_made_to_order, COALESCE(pt.name, p.slug) AS name
       FROM products p
       LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
       WHERE p.id IN (?)`,
      [productIds]
    )
    : [[]];

  return { demand, low, products, truncated: demand.length >= MAX_ITEMS || low.length >= MAX_ITEMS };
};

// Coordonnées utiles pour passer commande
const findSupplierContact = async (supplierId) => {
  const [rows] = await pool.query(
    `SELECT id, name, contact_name, email, phone, customer_number, website, supply_delay_days
     FROM suppliers WHERE id = ? LIMIT 1`,
    [supplierId]
  );
  return rows[0] ?? null;
};

module.exports = { summaryBySupplier, itemsForSupplier, findSupplierContact, LOW_STOCK_THRESHOLD, OPEN_ORDER_STATUSES };
