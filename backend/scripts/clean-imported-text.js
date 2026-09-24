#!/usr/bin/env node
/* ============================================================
 * Nettoyage des textes importés d'Excel — « _x000d_ » (audit recherche du 24/09)
 *
 * Excel échappe le retour chariot d'une cellule en « _x000d_ ». Le lecteur de
 * l'import ne le décodait pas (corrigé dans database/lib/xlsx-reader.js) : la
 * séquence s'affichait en toutes lettres en boutique.
 *
 *   - Noms : seule la première ligne est gardée. La suite répète la collection
 *     ou un fragment tronqué (« Riolis, kit Merci _x000d_ erci » → « Riolis,
 *     kit Merci »). Même règle que l'import (cleanName).
 *   - Descriptions : « _x000d_ » retiré, fins de ligne Windows ramenées à « \n ».
 *
 * Les slugs (URL) ne changent pas : un lien déjà partagé ou indexé reste valide.
 * Le cache catalogue expire en 5 min, ou immédiatement au redémarrage du backend.
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/clean-imported-text.js           # LISTE seulement
 *   node -r dotenv/config scripts/clean-imported-text.js --apply   # écrit en base
 * ============================================================ */

const { pool } = require('../config/db');

const APPLY = process.argv.includes('--apply');

// Première ligne non vide, sans séparateur final (« Sunflowers - » → « Sunflowers »)
const cleanName = (name) => {
  const first = String(name)
    .split(/_x000d_|[\r\n]+/i)
    .map((l) => l.trim())
    .find(Boolean) ?? '';
  return first.replace(/[\s,;:-]+$/, '');
};

async function main() {
  const [names] = await pool.query(
    `SELECT id, product_id, locale, name
     FROM product_translations
     WHERE name LIKE '%\\_x000d\\_%' OR name REGEXP '[\\r\\n]'`
  );
  const [[{ descCount }]] = await pool.query(
    `SELECT COUNT(*) AS descCount
     FROM product_translations
     WHERE description LIKE '%\\_x000d\\_%'`
  );

  const renames = names
    .map((r) => ({ ...r, cleaned: cleanName(r.name) }))
    .filter((r) => r.cleaned && r.cleaned !== r.name);

  console.log(`\nNoms à nettoyer : ${renames.length} — descriptions à nettoyer : ${descCount}\n`);
  for (const r of renames) {
    console.log(`  #${r.product_id} [${r.locale}] ${JSON.stringify(r.name)}\n      → ${r.cleaned}`);
  }

  if (!APPLY) {
    console.log('\nAucune écriture (liste seulement). Relancer avec --apply pour corriger.\n');
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (renames.length) {
      // Une seule requête pour tous les noms
      await connection.query(
        `UPDATE product_translations
         SET name = CASE id ${renames.map(() => 'WHEN ? THEN ?').join(' ')} END
         WHERE id IN (${renames.map(() => '?').join(', ')})`,
        [...renames.flatMap((r) => [r.id, r.cleaned]), ...renames.map((r) => r.id)]
      );
    }
    // REPLACE() distingue la casse : les deux graphies sont retirées
    const [descResult] = await connection.query(
      `UPDATE product_translations
       SET description = REPLACE(REPLACE(REPLACE(description, '_x000d_', ''), '_x000D_', ''), '\\r\\n', '\\n')
       WHERE description LIKE '%\\_x000d\\_%'`
    );
    await connection.commit();
    console.log(`\n${renames.length} nom(s) et ${descResult.affectedRows} description(s) corrigé(s).`);
    console.log('Redémarrer le backend (ou attendre 5 min) pour vider le cache catalogue.\n');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
