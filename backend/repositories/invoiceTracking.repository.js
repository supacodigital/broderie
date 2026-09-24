const { pool } = require('../config/db');

/* Suivi des factures QR — ticket ADM-09 (« suivi des factures clients payées »).

   Une commande par facture QR se paie par virement : la boutique l'expédie
   parfois avant le paiement, donc son statut courant ne dit pas si elle est
   payée. Le paiement est le passage au statut « paid » (bouton « Marquer comme
   payée »), conservé dans l'historique : c'est lui qui fait foi, même si la
   commande est ensuite passée en « expédiée » ou « livrée ».

   Filtres :
     unpaid  — pas de paiement, échéance non atteinte
     overdue — pas de paiement, échéance dépassée
     paid    — paiement enregistré
     all     — toutes, hors annulées et remboursées */

const PAID_SQL = `EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id AND h.status = 'paid')`;

// Moyen de paiement = celui du premier paiement de la commande
const INVOICE_METHOD_SQL = `(SELECT p.method FROM payments p WHERE p.order_id = o.id
                             ORDER BY p.created_at ASC, p.id ASC LIMIT 1) = 'invoice_qr'`;

const BASE_WHERE = `o.status NOT IN ('cancelled', 'refunded') AND ${INVOICE_METHOD_SQL}`;

const statusCondition = (status) => {
  switch (status) {
    case 'paid':    return { sql: PAID_SQL, params: [] };
    case 'unpaid':  return { sql: `NOT ${PAID_SQL} AND DATE_ADD(o.created_at, INTERVAL ? DAY) >= NOW()`, needsDue: true };
    case 'overdue': return { sql: `NOT ${PAID_SQL} AND DATE_ADD(o.created_at, INTERVAL ? DAY) < NOW()`, needsDue: true };
    default:        return { sql: '1 = 1', params: [] };
  }
};

/* Recherche : numéro de facture, référence QR, nom ou e-mail de la cliente, ou
   numéro de commande — pour retrouver la facture d'un virement du relevé. */
const searchCondition = (q) => {
  const term = String(q ?? '').trim();
  if (!term) return { sql: '1 = 1', params: [] };
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const compactRef = term.replace(/\s+/g, '');
  const orderId = /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : 0;
  return {
    sql: `(o.invoice_number LIKE ? OR o.qr_reference LIKE ? OR u.email LIKE ?
           OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR o.id = ?)`,
    params: [like, `%${compactRef}%`, like, like, orderId],
  };
};

/* Liste paginée. `dueDays` : délai de paiement réglé dans Paramètres →
   Facturation. Les factures à payer sont triées par échéance (la plus proche
   d'abord), les autres de la plus récente à la plus ancienne. */
const findInvoices = async ({ status = 'all', dueDays, page = 1, limit = 50, q = '' }) => {
  const cond = statusCondition(status);
  const search = searchCondition(q);
  const condParams = [...(cond.needsDue ? [dueDays] : cond.params), ...search.params];
  const order = status === 'unpaid' || status === 'overdue' ? 'o.created_at ASC, o.id ASC' : 'o.created_at DESC, o.id DESC';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id
     WHERE ${BASE_WHERE} AND ${cond.sql} AND ${search.sql}`,
    condParams
  );
  const [rows] = await pool.query(
    `SELECT o.id, o.invoice_number, o.qr_reference, o.created_at, o.total, o.status,
            u.first_name, u.last_name, u.email,
            (SELECT MIN(h.created_at) FROM order_status_history h
             WHERE h.order_id = o.id AND h.status = 'paid') AS paid_at
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE ${BASE_WHERE} AND ${cond.sql} AND ${search.sql}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
    [...condParams, limit, (page - 1) * limit]
  );
  return { rows, total };
};

// Compteurs des filtres (pastilles) — une seule requête
const countByStatus = async ({ dueDays }) => {
  const [[row]] = await pool.query(
    `SELECT
       SUM(${PAID_SQL}) AS paid,
       SUM(NOT ${PAID_SQL} AND DATE_ADD(o.created_at, INTERVAL ? DAY) >= NOW()) AS unpaid,
       SUM(NOT ${PAID_SQL} AND DATE_ADD(o.created_at, INTERVAL ? DAY) < NOW()) AS overdue,
       SUM(CASE WHEN NOT ${PAID_SQL} THEN o.total ELSE 0 END) AS outstanding,
       COUNT(*) AS total
     FROM orders o
     WHERE ${BASE_WHERE}`,
    [dueDays, dueDays]
  );
  return row;
};

module.exports = { findInvoices, countByStatus };
