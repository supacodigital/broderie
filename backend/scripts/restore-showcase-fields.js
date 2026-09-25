#!/usr/bin/env node
/* ============================================================
 * Remise en état des fiches abîmées par l'ancienne vitrine d'accueil
 *
 * Jusqu'au 25.09.2026, ajouter ou retirer un article de la vitrine renvoyait
 * toute sa fiche, et chaque champ absent de l'envoi était remis à zéro : la
 * marque, les dimensions, « sur commande » (un article sans stock s'affichait
 * alors « Épuisé »). Corrigé par le commit dd6038cb.
 *
 * Huit fiches touchées en production (contrôle du 25.09 : les seules de
 * l'import sans marque). Valeurs d'origine relues dans l'export ERP qui a servi
 * à l'import (donnees-client/V_ArticleC_INT.xlsx), même règle que
 * database/import-catalog.js : marque = Nom_Gamme, dimensions = Longueur /
 * Largeur, « sur commande » = publié sur internet et stock à 0.
 *
 * Seuls les champs VIDES sont remplis : une modification faite depuis dans
 * l'administration est conservée. « Sur commande » n'est rétabli que si le
 * stock est à 0 — un article remis en stock depuis est signalé, pas modifié.
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/restore-showcase-fields.js           # LISTE seulement
 *   node -r dotenv/config scripts/restore-showcase-fields.js --apply   # écrit en base
 * ============================================================ */

const { pool } = require('../config/db');

const APPLY = process.argv.includes('--apply');

// Clé : external_ref (NArticleC), stable entre les bases
const ORIGINAL = [
  { ref: '61404', brand: 'Lindner',                  lengthCm: null, widthCm: null, madeToOrder: 0 },
  { ref: '62119', brand: "Collection d'Art (diam.)", lengthCm: 40,   widthCm: 40,   madeToOrder: 1 },
  { ref: '62669', brand: 'Lanarte',                  lengthCm: 73,   widthCm: 58,   madeToOrder: 1 },
  { ref: '65428', brand: 'Luca-S',                   lengthCm: 25,   widthCm: 25,   madeToOrder: 0 },
  { ref: '66326', brand: 'Magic Needle',             lengthCm: 13,   widthCm: 13,   madeToOrder: 1 },
  { ref: '66361', brand: 'Magic Needle',             lengthCm: 12,   widthCm: 12,   madeToOrder: 1 },
  { ref: '66390', brand: 'Magic Needle',             lengthCm: 22,   widthCm: 22,   madeToOrder: 1 },
  { ref: '66581', brand: 'Stafil',                   lengthCm: 70,   widthCm: 50,   madeToOrder: 0 },
];

async function main() {
  const [rows] = await pool.query(
    `SELECT p.id, p.external_ref, p.brand, p.length_cm, p.width_cm, p.is_made_to_order, p.stock,
            LEFT(pt.name, 40) AS name
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
     WHERE p.deleted_at IS NULL AND p.external_ref IN (?)`,
    [ORIGINAL.map((o) => o.ref)]
  );
  const byRef = new Map(rows.map((r) => [r.external_ref, r]));

  const changes = [];
  const toDecide = [];
  for (const o of ORIGINAL) {
    const p = byRef.get(o.ref);
    if (!p) { console.log(`  ⚠️  réf. ${o.ref} introuvable — ignorée`); continue; }
    const fields = [];
    if (p.brand === null && o.brand) fields.push(`marque → ${o.brand}`);
    if (p.length_cm === null && o.lengthCm !== null) fields.push(`longueur → ${o.lengthCm} cm`);
    if (p.width_cm === null && o.widthCm !== null) fields.push(`largeur → ${o.widthCm} cm`);
    if (o.madeToOrder && !p.is_made_to_order) {
      if (Number(p.stock) === 0) fields.push('sur commande → oui');
      else toDecide.push(`#${p.id} ${p.name} : sur commande à l'import, stock actuel ${p.stock} — non modifié`);
    }
    if (fields.length) changes.push({ id: p.id, ref: o.ref, name: p.name, fields });
  }

  console.log(`\nFiches à remettre en état : ${changes.length}\n`);
  for (const c of changes) console.log(`  #${c.id} (réf. ${c.ref}) ${c.name}\n      ${c.fields.join(' · ')}`);
  if (toDecide.length) {
    console.log('\nÀ trancher avec la boutique :');
    for (const t of toDecide) console.log(`  ${t}`);
  }

  if (!APPLY) {
    console.log('\nSimulation — rien n\'a été écrit. Relancer avec --apply pour appliquer.\n');
    return;
  }
  if (changes.length === 0) {
    console.log('\nRien à appliquer.\n');
    return;
  }

  /* Une seule requête : table dérivée des valeurs d'origine, jointe par
     référence. COALESCE ne remplit que les champs vides ; « sur commande »
     n'est rétabli que pour un stock à 0. */
  const derived = ORIGINAL
    .map(() => 'SELECT ? AS ref, ? AS brand, ? AS length_cm, ? AS width_cm, ? AS made_to_order')
    .join(' UNION ALL ');
  const params = ORIGINAL.flatMap((o) => [o.ref, o.brand, o.lengthCm, o.widthCm, o.madeToOrder]);
  const [result] = await pool.query(
    `UPDATE products p
       INNER JOIN (${derived}) o ON o.ref = p.external_ref
       SET p.brand            = COALESCE(p.brand, o.brand),
           p.length_cm        = COALESCE(p.length_cm, o.length_cm),
           p.width_cm         = COALESCE(p.width_cm, o.width_cm),
           p.is_made_to_order = CASE WHEN o.made_to_order = 1 AND p.stock = 0 THEN 1 ELSE p.is_made_to_order END
     WHERE p.deleted_at IS NULL`,
    params
  );
  console.log(`\n✅ ${result.changedRows} fiche(s) modifiée(s). Le catalogue en cache se met à jour sous 5 minutes (ou au prochain pm2 reload).\n`);
}

main()
  .catch((err) => { console.error('❌', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
