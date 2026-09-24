#!/usr/bin/env node
/* ============================================================
 * Audit de la recherche boutique — chaque article est-il trouvable ?
 *
 * Pour CHAQUE article actif, lance les recherches qu'une cliente taperait
 * réellement, et vérifie que l'article remonte :
 *   - nom exact                         → doit être dans les 5 premiers
 *   - nom sans accents, en minuscules   → idem
 *   - nom sans la marque (après « , »)  → idem
 *   - apostrophe typographique « ’ »    → idem (clavier de l'iPhone)
 *   - référence (SKU)                   → doit être 1er
 *
 * Une place partagée avec un article de nom identique compte comme trouvée :
 * deux fiches « Permin, kit X » ne peuvent pas être départagées par le nom.
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/audit-search.js            # tout le catalogue
 *   node -r dotenv/config scripts/audit-search.js --limit 500
 *   node -r dotenv/config scripts/audit-search.js --out /chemin/rapport.json
 *   node -r dotenv/config scripts/audit-search.js --ids 4139,8432   # articles précis
 *
 * Lecture seule : aucune écriture en base. Le journal des recherches sans
 * résultat est alimenté par le contrôleur, pas par le dépôt interrogé ici.
 * ============================================================ */

const { pool } = require('../config/db');
const productRepository = require('../repositories/product.repository');

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const LIMIT = Number(argValue('--limit')) || null;
const OUT = argValue('--out');
const IDS = (argValue('--ids') || '').split(',').map(Number).filter(Boolean);
const CONCURRENCY = 12;
const TOP = 5;
const DEPTH = 50; // au-delà, l'article est considéré comme noyé

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Deux noms qui ne diffèrent que par la ponctuation (« - » / « , ») sont le même nom
const normName = (s) => stripAccents(String(s || '')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Nom sans la marque (« Marque, reste » → « reste »)
const withoutBrand = (s) => { const i = String(s).indexOf(','); return i > 0 ? String(s).slice(i + 1) : String(s); };

/* Rang de l'article (1 = premier). Un ex æquo au nom identique est ramené au
   premier de ce nom ; recherché SANS la marque, un article de même nom chez une
   autre marque (« kit mariage » chez RTO et Bonheur des Dames) est aussi un ex
   æquo — rien ne peut les départager. */
const rankOf = (rows, product, { ignoreBrand = false } = {}) => {
  const idx = rows.findIndex((r) => r.id === product.id);
  if (idx === -1) return null;
  const key = (n) => normName(ignoreBrand ? withoutBrand(n) : n);
  const sameNameIdx = rows.findIndex((r) => key(r.name) === key(product.name));
  return Math.min(idx, sameNameIdx) + 1;
};

const variantsFor = (p) => {
  const v = [{ kind: 'nom exact', q: p.name, max: TOP }];
  const noAccent = stripAccents(p.name).toLowerCase();
  if (noAccent !== p.name.toLowerCase()) v.push({ kind: 'sans accents', q: noAccent, max: TOP });
  const comma = p.name.indexOf(', ');
  if (comma > 0 && comma < p.name.length - 3) v.push({ kind: 'sans la marque', q: p.name.slice(comma + 2), max: TOP });
  if (p.name.includes("'")) v.push({ kind: 'apostrophe iPhone', q: p.name.replace(/'/g, '’'), max: TOP });
  if (p.sku && p.sku.trim().length >= 3) v.push({ kind: 'référence', q: p.sku.trim(), max: 1 });
  return v;
};

async function main() {
  const [products] = await pool.query(
    `SELECT p.id, p.sku, pt.name
     FROM products p
     JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
     WHERE p.is_active = 1 AND p.deleted_at IS NULL
       ${IDS.length ? `AND p.id IN (${IDS.map(() => '?').join(', ')})` : ''}
     ORDER BY p.id
     ${LIMIT ? 'LIMIT ' + Number(LIMIT) : ''}`,
    IDS
  );

  const tasks = [];
  for (const p of products) for (const v of variantsFor(p)) tasks.push({ p, v });

  const stats = {};
  const failures = [];
  let done = 0;
  const started = Date.now();

  async function run(task) {
    const { p, v } = task;
    const s = (stats[v.kind] ??= { total: 0, ok: 0, buried: 0, missing: 0, errors: 0 });
    s.total += 1;
    try {
      const { rows } = await productRepository.findAll({ locale: 'fr', q: v.q, limit: DEPTH, page: 1 });
      const rank = rankOf(rows, p, { ignoreBrand: v.kind === 'sans la marque' });
      if (rank !== null && rank <= v.max) s.ok += 1;
      else {
        if (rank === null) s.missing += 1; else s.buried += 1;
        failures.push({ kind: v.kind, id: p.id, sku: p.sku, name: p.name, q: v.q, rank, first: rows[0]?.name ?? null, count: rows.length });
      }
    } catch (err) {
      s.errors += 1;
      failures.push({ kind: v.kind, id: p.id, sku: p.sku, name: p.name, q: v.q, error: err.message });
    }
    done += 1;
    if (done % 2000 === 0) process.stderr.write(`  … ${done}/${tasks.length}\n`);
  }

  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < tasks.length) await run(tasks[cursor++]);
  }));

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\nArticles audités : ${products.length} — recherches : ${tasks.length} — ${seconds} s\n`);
  console.log('Variante            | total | OK     | mal classé | introuvable | erreur');
  for (const [kind, s] of Object.entries(stats)) {
    const pct = ((s.ok / s.total) * 100).toFixed(1);
    console.log(`${kind.padEnd(19)} | ${String(s.total).padStart(5)} | ${pct.padStart(5)}% | ${String(s.buried).padStart(10)} | ${String(s.missing).padStart(11)} | ${s.errors}`);
  }

  if (OUT) {
    require('fs').writeFileSync(OUT, JSON.stringify({ stats, failures }, null, 1));
    console.log(`\nDétail des échecs : ${OUT}`);
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
