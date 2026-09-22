#!/usr/bin/env node
/* ============================================================
 * Complète les coordonnées des fournisseurs depuis `supply.xlsx`.
 *
 * Contexte : les 29 fiches fournisseurs ont été créées le 2026-09-16 à partir de
 * la seule colonne « Fournisseur » du catalogue — elles ne portaient qu'un nom.
 * Le 2026-09-22, la cliente a livré `supply.xlsx`, l'export « Personne » de son
 * ancien ERP, qui contient les coordonnées complètes.
 *
 * Le script MET À JOUR les fiches existantes, appariées par NOM (insensible à la
 * casse et aux espaces). Il ne crée AUCUN fournisseur : une société de supply.xlsx
 * sans fiche en base est signalée puis ignorée (décision du 2026-09-22 — deux
 * sociétés du fichier n'ont aucun article au catalogue).
 *
 * ⚠️ La colonne « Remarque » du fichier n'est JAMAIS importée. Elle contient, pour
 * six fiches, des numéros de carte bancaire en clair avec date de validité et CVC.
 * Les écrire dans `suppliers.notes` les exposerait dans l'administration et dans
 * tout export ultérieur du catalogue. Ne pas « rétablir » cette colonne sans avoir
 * traité la question avec la cliente.
 *
 * Par défaut le script ne REMPLIT QUE LES CHAMPS VIDES : une donnée saisie à la
 * main dans l'administration prime sur le fichier de l'ERP. `--overwrite` inverse
 * ce comportement (le fichier fait foi), à n'utiliser qu'en connaissance de cause.
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/import-supplier-contacts.js --dry-run
 *   node ../database/import-supplier-contacts.js
 *   node ../database/import-supplier-contacts.js --overwrite
 *   node ../database/import-supplier-contacts.js --excel=chemin.xlsx
 * ============================================================ */

const path = require('path');

const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

const { readSheetObjects } = require('./lib/xlsx-reader');

// ── CLI ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const value = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};

const DRY_RUN = has('--dry-run');
const OVERWRITE = has('--overwrite');
const EXCEL_PATH = path.resolve(
  value('excel', path.join(__dirname, '../donnees-client/supply.xlsx'))
);

// ── Colonnes du fichier ERP ────────────────────────────────
const COL = {
  company:     'Société',
  lastName:    'contact_01_Nom',
  firstName:   'contact_01_Prénom',
  street:      'Rue',
  number:      'numero',
  zip:         'Numéro postal',
  city:        'Ville',
  country:     'Pays',
  phone:       'Tél',
  mobile:      'Natel',
  email:       'contact_01_courriel',
  emailInvoice:'courriel_facture',
  website:     'www',
  customerNo:  'Num Client',
  supplyDelay: 'delais_liv',
  paymentTerms:'delais_paiement',
};

/* Pays : la colonne `country` est un CHAR(2), le fichier donne des libellés en
   toutes lettres et dans plusieurs langues. Table explicite — on ne devine pas :
   un libellé absent d'ici laisse le pays vide plutôt que de risquer un faux code. */
const COUNTRY_CODES = {
  'suisse': 'CH', 'schweiz': 'CH', 'switzerland': 'CH',
  'france': 'FR',
  'allemagne': 'DE', 'deutschland': 'DE', 'germany': 'DE',
  'italie': 'IT', 'italia': 'IT', 'italy': 'IT',
  'belgique': 'BE', 'belgium': 'BE',
  'danemark': 'DK', 'denmark': 'DK',
  'lituanie': 'LT', 'lithuania': 'LT',
  'lettonie': 'LV', 'latvia': 'LV',
  'pays-bas': 'NL', 'hollande': 'NL', 'holland': 'NL', 'netherlands': 'NL',
  'usa': 'US', 'états-unis': 'US', 'etats-unis': 'US', 'united states': 'US',
  'gb': 'GB', 'royaume-uni': 'GB', 'angleterre': 'GB', 'united kingdom': 'GB',
};

const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '.' ? null : s; // « . » = case vidée par l'ERP
};

/* Les cellules e-mail contiennent parfois une formule de politesse collée à la
   suite (« contact@… ⏎ Merci beaucoup, ⏎ Julie ») ou un numéro de compte.
   On ne garde que la première adresse repérable, et seulement si elle est
   syntaxiquement plausible — sinon la fiche partirait avec un paragraphe. */
const extractEmail = (v) => {
  const s = cleanStr(v);
  if (!s) return null;
  const match = s.match(/[^\s<>()[\],;:"]+@[^\s<>()[\],;:"]+\.[A-Za-z]{2,}/);
  return match ? match[0].replace(/[.,;]+$/, '') : null;
};

const toCountryCode = (v) => {
  const s = cleanStr(v);
  if (!s) return null;
  return COUNTRY_CODES[s.toLowerCase()] || null;
};

// Délais ERP : entiers positifs en jours. Une valeur non numérique est ignorée.
const toDays = (v) => {
  const s = cleanStr(v);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
};

const buildContactName = (row) => {
  const last = cleanStr(row[COL.lastName]);
  const first = cleanStr(row[COL.firstName]);
  return [first, last].filter(Boolean).join(' ') || null;
};

// Champs de `suppliers` alimentés, dans l'ordre d'affichage de l'administration
const FIELDS = [
  'contact_name', 'email', 'phone', 'street', 'street_number',
  'zip', 'city', 'country', 'customer_number', 'website',
  'supply_delay_days', 'payment_terms_days',
];

const mapRow = (row) => ({
  contact_name:    buildContactName(row),
  // Contact commercial d'abord, e-mail de facturation en repli
  email:           extractEmail(row[COL.email]) || extractEmail(row[COL.emailInvoice]),
  phone:           cleanStr(row[COL.phone]) || cleanStr(row[COL.mobile]),
  street:          cleanStr(row[COL.street]),
  street_number:   cleanStr(row[COL.number]),
  zip:             cleanStr(row[COL.zip]),
  city:            cleanStr(row[COL.city]),
  country:         toCountryCode(row[COL.country]),
  customer_number: cleanStr(row[COL.customerNo]),
  website:         cleanStr(row[COL.website]),
  supply_delay_days:  toDays(row[COL.supplyDelay]),
  payment_terms_days: toDays(row[COL.paymentTerms]),
});

async function main() {
  console.log(`\nFichier .......... ${EXCEL_PATH}`);
  console.log(`Mode ............. ${DRY_RUN ? 'SIMULATION (aucune écriture)' : 'ÉCRITURE'}`);
  console.log(`Champs déjà remplis  ${OVERWRITE ? 'ÉCRASÉS (--overwrite)' : 'conservés'}`);

  const rows = readSheetObjects(EXCEL_PATH);

  // Index du fichier par nom normalisé
  const byKey = new Map();
  for (const row of rows) {
    const company = cleanStr(row[COL.company]);
    if (!company) continue;
    byKey.set(company.toLowerCase(), { company, data: mapRow(row) });
  }
  console.log(`\nSociétés dans le fichier ... ${byKey.size}`);

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const [existing] = await connection.execute(
      `SELECT id, name, ${FIELDS.join(', ')} FROM suppliers`
    );

    const updates = [];
    const unchanged = [];
    const matchedKeys = new Set();

    for (const supplier of existing) {
      const key = supplier.name.trim().toLowerCase();
      const found = byKey.get(key);
      if (!found) continue;
      matchedKeys.add(key);

      // Ne changer que ce qui apporte une valeur : champ vide en base (ou --overwrite),
      // valeur présente dans le fichier, et réellement différente de l'existant.
      const changes = {};
      for (const field of FIELDS) {
        const incoming = found.data[field];
        if (incoming === null) continue;
        const current = supplier[field];
        let isEmpty = current === null || current === undefined || String(current).trim() === '';
        /* `country` vaut 'CH' par DÉFAUT de colonne, pas par saisie : les 29 fiches
           créées depuis le catalogue le portent toutes alors qu'aucun pays n'a été
           renseigné. Sans cette exception, Permin resterait « CH » au lieu de « DK ».
           On ne remplace que ce défaut — un pays autre que 'CH' est une vraie saisie. */
        if (field === 'country' && String(current ?? '') === 'CH') isEmpty = true;
        if (!isEmpty && !OVERWRITE) continue;
        if (String(current ?? '') === String(incoming)) continue;
        changes[field] = incoming;
      }

      if (Object.keys(changes).length === 0) unchanged.push(supplier.name);
      else updates.push({ id: supplier.id, name: supplier.name, changes });
    }

    // Sociétés du fichier sans fiche en base — signalées, jamais créées
    const orphans = [...byKey.values()]
      .filter((s) => !matchedKeys.has(s.company.toLowerCase()))
      .map((s) => s.company);

    console.log(`Fiches en base ............ ${existing.length}`);
    console.log(`Appariées par nom ......... ${matchedKeys.size}`);
    console.log(`À mettre à jour ........... ${updates.length}`);
    console.log(`Déjà à jour ............... ${unchanged.length}`);

    if (updates.length > 0) {
      console.log('\n--- Détail des modifications ---');
      for (const u of updates) {
        const detail = Object.entries(u.changes)
          .map(([f, v]) => `${f}=${v}`)
          .join(', ');
        console.log(`  ${u.name}\n      ${detail}`);
      }
    }

    if (orphans.length > 0) {
      console.log(`\n⚠ ${orphans.length} société(s) du fichier sans fiche en base — ignorée(s) :`);
      orphans.forEach((n) => console.log(`    ${n}`));
    }

    // Fiches en base absentes du fichier : leurs coordonnées restent à compléter
    const missing = existing
      .filter((s) => !matchedKeys.has(s.name.trim().toLowerCase()))
      .map((s) => s.name);
    if (missing.length > 0) {
      console.log(`\n⚠ ${missing.length} fiche(s) en base absente(s) du fichier :`);
      missing.forEach((n) => console.log(`    ${n}`));
    }

    if (DRY_RUN) {
      console.log('\nSimulation terminée — relancer sans --dry-run pour appliquer.');
      return;
    }
    if (updates.length === 0) {
      console.log('\nRien à mettre à jour.');
      return;
    }

    // Une transaction pour l'ensemble : soit toutes les fiches sont complétées, soit aucune
    await connection.beginTransaction();
    try {
      for (const u of updates) {
        const fields = Object.keys(u.changes);
        const setClause = fields.map((f) => `${f} = ?`).join(', ');
        await connection.execute(
          `UPDATE suppliers SET ${setClause} WHERE id = ?`,
          [...fields.map((f) => u.changes[f]), u.id]
        );
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    console.log(`\n✓ ${updates.length} fiche(s) fournisseur complétée(s).`);
    console.log('  La colonne « Remarque » du fichier n’a volontairement pas été importée.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nÉchec de l’import des coordonnées fournisseurs :', err.message);
  process.exit(1);
});
