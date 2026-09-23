#!/usr/bin/env node
/* ============================================================
 * Renvoi des QR-factures non reçues — incident du 16/09 au 24/09/2026
 *
 * Pendant cette période, l'e-mail de facture plantait à chaque commande par
 * facture (« issuer is not defined ») : les clientes n'ont jamais reçu leur
 * QR-facture. Ce script liste les commandes concernées et, sur demande
 * explicite, leur renvoie la facture.
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/resend-invoices.js                 # LISTE seulement
 *   node -r dotenv/config scripts/resend-invoices.js --send          # envoie
 *   node -r dotenv/config scripts/resend-invoices.js --since 2026-09-16 --only 57,58
 *
 * Ne concerne que les commandes par facture encore « Facture à payer » : une
 * commande payée, annulée ou remboursée n'a pas à recevoir de facture à régler.
 * La facture renvoyée est identique à celle qui aurait dû partir (même numéro,
 * même référence QR) : aucun numéro n'est consommé.
 * ============================================================ */

const { pool } = require('../config/db');
const orderRepository = require('../repositories/order.repository');
const userRepository = require('../repositories/user.repository');
const invoiceService = require('../services/invoice.service');

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const SEND = args.includes('--send');
const SINCE = argValue('--since') || '2026-09-16';
const ONLY = (argValue('--only') || '').split(',').map(Number).filter(Boolean);

async function main() {
  const [rows] = await pool.query(
    `SELECT o.id, o.invoice_number, o.total, o.created_at, u.email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.status = 'pending_invoice'
       AND o.created_at >= ?
       AND (SELECT p.method FROM payments p WHERE p.order_id = o.id
            ORDER BY p.created_at ASC, p.id ASC LIMIT 1) = 'invoice_qr'
       ${ONLY.length ? `AND o.id IN (${ONLY.map(() => '?').join(', ')})` : ''}
     ORDER BY o.id`,
    [SINCE, ...ONLY]
  );

  console.log(`\nCommandes par facture impayées depuis le ${SINCE} : ${rows.length}\n`);
  for (const r of rows) {
    const date = new Date(r.created_at).toISOString().slice(0, 10);
    console.log(`  #${r.id}  ${date}  facture ${r.invoice_number ?? '(sans numéro)'}  CHF ${r.total}  → ${r.email}`);
  }

  if (!SEND) {
    console.log('\nAucun e-mail envoyé (liste seulement). Relancer avec --send pour envoyer.\n');
    return;
  }

  console.log('\nEnvoi…');
  let sent = 0;
  for (const r of rows) {
    try {
      const order = await orderRepository.findById(r.id);
      const user = await userRepository.findById(order.user_id);
      await invoiceService.sendInvoiceEmail({ user, order });
      sent += 1;
      console.log(`  ✓ #${r.id} envoyée à ${r.email}`);
    } catch (err) {
      console.log(`  ✗ #${r.id} : ${err.message}`);
    }
  }
  console.log(`\n${sent}/${rows.length} facture(s) envoyée(s).\n`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
