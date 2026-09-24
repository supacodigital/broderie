#!/usr/bin/env node
/* ============================================================
 * Réalignement de la TVA stockée des commandes existantes (ADM-14)
 *
 * Jusqu'au 24.09.2026, orders.tax_amount était calculé sur les seuls articles,
 * arrondi à 0.05 : les frais de port étaient laissés hors TVA. La facture
 * recalcule désormais la TVA port compris, au centime ; ce script aligne le
 * montant stocké — affiché dans l'administration, l'espace client et l'e-mail
 * de confirmation — sur celui de la facture.
 *
 * Seul tax_amount change : le total payé, les prix et les frais de port restent
 * identiques (prix TTC).
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/recompute-order-vat.js           # LISTE seulement
 *   node -r dotenv/config scripts/recompute-order-vat.js --apply   # écrit en base
 * ============================================================ */

const { pool } = require('../config/db');
const { computeOrderVat } = require('../utils/tva.utils');

const APPLY = process.argv.includes('--apply');

async function main() {
  const [orders] = await pool.query(
    `SELECT id, subtotal, shipping_cost, tax_amount, total
     FROM orders
     ORDER BY id`
  );
  if (orders.length === 0) {
    console.log('\nAucune commande.\n');
    return;
  }

  // Toutes les lignes en une requête — jamais une requête par commande
  const [items] = await pool.query(
    `SELECT order_id, unit_price, quantity, tax_rate_snapshot
     FROM order_items
     WHERE order_id IN (${orders.map(() => '?').join(', ')})`,
    orders.map((o) => o.id)
  );
  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  }

  const changes = [];
  for (const o of orders) {
    const { total } = computeOrderVat({
      items:              itemsByOrder.get(o.id) || [],
      discountedSubtotal: parseFloat(o.subtotal),
      shippingCost:       parseFloat(o.shipping_cost) || 0,
    });
    const stored = parseFloat(o.tax_amount);
    if (Math.abs(total - stored) >= 0.005) changes.push({ id: o.id, stored, computed: total, orderTotal: o.total });
  }

  console.log(`\nCommandes : ${orders.length} — TVA à réaligner : ${changes.length}\n`);
  for (const c of changes) {
    console.log(`  #${c.id}  total CHF ${c.orderTotal}  TVA stockée ${c.stored.toFixed(2)} → ${c.computed.toFixed(2)}`);
  }

  if (!APPLY || changes.length === 0) {
    if (changes.length) console.log('\nAucune écriture (liste seulement). Relancer avec --apply pour corriger.\n');
    return;
  }

  /* Une seule requête pour toutes les commandes. `updated_at` est conservé :
     une correction de données n'est pas une activité sur la commande. */
  await pool.query(
    `UPDATE orders
     SET tax_amount = CASE id ${changes.map(() => 'WHEN ? THEN ?').join(' ')} END,
         updated_at = updated_at
     WHERE id IN (${changes.map(() => '?').join(', ')})`,
    [...changes.flatMap((c) => [c.id, c.computed]), ...changes.map((c) => c.id)]
  );
  console.log(`\n${changes.length} commande(s) corrigée(s).\n`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
