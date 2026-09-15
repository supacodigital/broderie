#!/usr/bin/env node
/* ============================================================
 * Génère le fichier Excel de travail du catalogue, à remplir par la cliente
 * puis à réimporter (voir import-catalog-updates.js).
 *
 * Demande cliente : « me renvoyer ton fichier article en format XLS pour que je
 * puisse mettre les articles dans chaque catégorie enfant, mettre les
 * fournisseurs, contrôler les prix et rajouter un champ pour enlever des
 * articles ».
 *
 * Le fichier reprend la mise en page déjà validée par la cliente
 * (Catalogue-a-completer-photos.xlsx) : titre en ligne 1, en-têtes en ligne 3,
 * données à partir de la ligne 4 — import-catalog-photos.js lit ce format tel quel.
 *
 * Colonnes ajoutées par rapport au fichier d'origine :
 *   - Prix CHF ....... devient MODIFIABLE (elle veut contrôler les prix)
 *   - Fournisseur .... liste déroulante, alimentée par la table suppliers
 *   - SUPPRIMER ...... « O » pour retirer l'article de la boutique (soft delete)
 *
 * Les colonnes grisées sont verrouillées : elles servent de repère et ne doivent
 * pas être modifiées (la référence est la clé d'appariement au réimport).
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/export-catalog-excel.js
 *   node ../database/export-catalog-excel.js --out=/chemin/fichier.xlsx
 *   node ../database/export-catalog-excel.js --all       # inclut les articles inactifs
 * ============================================================ */

const path = require('path');

const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));
const ExcelJS = require(path.join(BACKEND, 'node_modules/exceljs'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

// ── CLI ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const value = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};

const INCLUDE_INACTIVE = has('--all');
const OUT_PATH = path.resolve(
  value('out', path.join(__dirname, '../donnees-client/Catalogue-articles.xlsx'))
);

/* Colonnes du fichier — `locked: true` = repère non modifiable.
   L'ordre et les libellés des 16 premières colonnes reprennent exactement le
   fichier déjà connu de la cliente, pour ne pas la désorienter. */
const COLUMNS = [
  { header: 'Référence (NArticleC)',   key: 'ref',        width: 16, locked: true },
  { header: 'Nom du produit (FR)',     key: 'name',       width: 46, locked: true },
  { header: 'Gamme',                   key: 'brand',      width: 20, locked: true },
  { header: 'Catégorie',               key: 'category',   width: 30 },
  { header: 'Fournisseur',             key: 'supplier',   width: 26 },
  { header: 'Prix CHF',                key: 'price',      width: 11 },
  { header: 'Stock',                   key: 'stock',      width: 8,  locked: true },
  { header: 'SUPPRIMER (O/N)',         key: 'remove',     width: 16 },
  { header: 'NOM DU FICHIER PHOTO',    key: 'photo1',     width: 26 },
  { header: 'Photo 2 (optionnelle)',   key: 'photo2',     width: 22 },
  { header: 'Photo 3 (optionnelle)',   key: 'photo3',     width: 22 },
  { header: 'Description (FR)',        key: 'description', width: 50 },
  { header: 'Poids (kg)',              key: 'weight',     width: 11 },
  { header: 'Longueur (cm)',           key: 'length',     width: 13 },
  { header: 'Largeur (cm)',            key: 'width',      width: 12 },
  { header: 'SKU / Réf. fabricant',    key: 'sku',        width: 20, locked: true },
  { header: 'EAN',                     key: 'ean',        width: 16, locked: true },
  { header: 'Remarques cliente',       key: 'notes',      width: 30 },
];

const TITLE_ROW  = 1;
const HEADER_ROW = 3;

const GREY_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
const GREEN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDF3E4' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5D50' } };

const INSTRUCTIONS = [
  ['Mode d\'emploi — fichier catalogue'],
  [''],
  ['Ce fichier liste tous les articles de la boutique. Vous pouvez le remplir en'],
  ['plusieurs fois et nous le renvoyer autant de fois que nécessaire.'],
  [''],
  ['Colonnes GRISES : ne pas modifier.'],
  ['   Elles servent à retrouver l\'article (surtout la référence).'],
  [''],
  ['Colonnes VERTES : à vous de les remplir ou de les corriger.'],
  ['   • Catégorie ...... choisissez dans la liste déroulante'],
  ['   • Fournisseur .... choisissez dans la liste déroulante'],
  ['   • Prix CHF ....... corrigez si le prix est faux (ex : 12.50)'],
  ['   • SUPPRIMER ...... écrivez O pour retirer l\'article de la boutique'],
  ['   • Photos ......... nom exact du fichier image (ex : riolis-chat.jpg)'],
  ['   • Description .... texte affiché sur la fiche produit'],
  ['   • Poids / dimensions — utiles au calcul des frais de port'],
  [''],
  ['Photos : déposez les images dans le dossier partagé, à côté de ce fichier.'],
  ['Le nom écrit dans la colonne doit être exactement celui du fichier.'],
  [''],
  ['SUPPRIMER : l\'article est retiré de la boutique mais rien n\'est effacé —'],
  ['on peut le remettre en ligne à tout moment.'],
  [''],
  ['Ne pas renommer les onglets ni déplacer les colonnes : le fichier est relu'],
  ['automatiquement et il a besoin de retrouver cette structure.'],
];

async function main() {
  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Catégories : libellé FR, chemin complet pour distinguer les homonymes
    const [categories] = await connection.execute(
      `SELECT c.id, ct.name, p.id AS parent_id, pt.name AS parent_name
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
       LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN category_translations pt ON pt.category_id = p.id AND pt.locale = 'fr'
       ORDER BY COALESCE(pt.name, ''), ct.name`
    );
    const categoryLabels = categories
      .map((c) => (c.parent_name ? `${c.parent_name} > ${c.name}` : c.name))
      .filter(Boolean);

    const [suppliers] = await connection.execute(
      `SELECT name FROM suppliers WHERE is_active = 1 ORDER BY name`
    );
    const supplierLabels = suppliers.map((s) => s.name).filter(Boolean);

    const [products] = await connection.execute(
      `SELECT
         p.external_ref, p.sku, p.ean, p.brand, p.price_chf, p.stock,
         p.weight_kg, p.length_cm, p.width_cm,
         pt.name AS name, pt.description AS description,
         ct.name AS category_name, pct.name AS parent_category_name,
         s.name AS supplier_name
       FROM products p
       LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
       LEFT JOIN categories pc ON pc.id = c.parent_id
       LEFT JOIN category_translations pct ON pct.category_id = pc.id AND pct.locale = 'fr'
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.deleted_at IS NULL ${INCLUDE_INACTIVE ? '' : 'AND p.is_active = 1'}
       ORDER BY p.brand, pt.name`
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Au Point Compté';
    workbook.created = new Date();

    // ── Onglet Instructions ──
    const guide = workbook.addWorksheet('Instructions');
    guide.getColumn(1).width = 80;
    INSTRUCTIONS.forEach((line) => guide.addRow(line));
    guide.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF2F5D50' } };
    [6, 9].forEach((r) => { guide.getRow(r).font = { bold: true }; });

    // ── Onglet Catalogue ──
    const sheet = workbook.addWorksheet('Catalogue', {
      views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    });

    sheet.getRow(TITLE_ROW).getCell(1).value =
      'Au Point Compté — Catalogue des articles (catégories, fournisseurs, prix, suppressions)';
    sheet.getRow(TITLE_ROW).font = { bold: true, size: 13, color: { argb: 'FF2F5D50' } };
    sheet.getRow(2).getCell(1).value =
      'Colonnes grises : ne pas modifier. Colonnes vertes : à compléter. Voir l\'onglet « Instructions ».';
    sheet.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF666666' } };

    const header = sheet.getRow(HEADER_ROW);
    COLUMNS.forEach((col, i) => {
      const cell = header.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      sheet.getColumn(i + 1).width = col.width;
    });
    header.height = 30;

    products.forEach((p) => {
      const row = sheet.addRow([
        p.external_ref ?? '',
        p.name ?? '',
        p.brand ?? '',
        p.parent_category_name ? `${p.parent_category_name} > ${p.category_name}` : (p.category_name ?? ''),
        p.supplier_name ?? '',
        p.price_chf !== null ? Number(p.price_chf) : null,
        p.stock ?? 0,
        '',
        '', '', '',
        p.description ?? '',
        p.weight_kg !== null ? Number(p.weight_kg) : null,
        p.length_cm !== null ? Number(p.length_cm) : null,
        p.width_cm !== null ? Number(p.width_cm) : null,
        p.sku ?? '',
        p.ean ?? '',
        '',
      ]);

      COLUMNS.forEach((col, i) => {
        const cell = row.getCell(i + 1);
        if (col.locked) {
          cell.fill = GREY_FILL;
          cell.protection = { locked: true };
        } else {
          cell.fill = GREEN_FILL;
          cell.protection = { locked: false };
        }
      });
      row.getCell(6).numFmt = '0.00';
    });

    const lastRow = sheet.rowCount;
    const firstDataRow = HEADER_ROW + 1;

    /* Listes déroulantes — évitent les libellés approximatifs, qui ne seraient pas
       reconnus au réimport.
       Les valeurs sont déposées dans une feuille annexe puis référencées par plage :
       une liste littérale (« a,b,c ») est plafonnée à 255 caractères par Excel, ce qui
       ne suffit pas pour 54 catégories. La feuille est masquée pour ne pas encombrer. */
    const refSheet = workbook.addWorksheet('Listes', { state: 'veryHidden' });
    refSheet.getColumn(1).width = 40;
    refSheet.getColumn(2).width = 30;
    categoryLabels.forEach((label, i) => { refSheet.getCell(i + 1, 1).value = label; });
    supplierLabels.forEach((label, i) => { refSheet.getCell(i + 1, 2).value = label; });

    const addList = (colIndex, values, refColumn) => {
      if (!values.length) return false;
      const formula = `Listes!$${refColumn}$1:$${refColumn}$${values.length}`;
      for (let r = firstDataRow; r <= lastRow; r++) {
        sheet.getCell(r, colIndex).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Valeur inconnue',
          error: 'Choisissez une valeur de la liste, sinon la ligne sera ignorée au réimport.',
        };
      }
      return true;
    };

    const categoryListOk = addList(4, categoryLabels, 'A');
    const supplierListOk = addList(5, supplierLabels, 'B');

    // SUPPRIMER : uniquement O ou N, pour lever toute ambiguïté
    for (let r = firstDataRow; r <= lastRow; r++) {
      sheet.getCell(r, 8).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"O,N"'],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Valeur attendue : O ou N',
        error: 'Écrivez O pour retirer l\'article de la boutique, ou laissez vide.',
      };
    }

    sheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to:   { row: HEADER_ROW, column: COLUMNS.length },
    };

    await workbook.xlsx.writeFile(OUT_PATH);

    console.log(`\n✓ Fichier généré : ${OUT_PATH}`);
    console.log(`  Articles ................ ${products.length}`);
    console.log(`  Catégories proposées .... ${categoryLabels.length}${categoryListOk ? '' : ' (aucune → saisie libre)'}`);
    console.log(`  Fournisseurs proposés ... ${supplierLabels.length}${supplierLabels.length === 0 ? ' — table suppliers vide !' : (supplierListOk ? '' : ' (saisie libre)')}`);
    if (supplierLabels.length === 0) {
      console.log('\n  ⚠ Aucun fournisseur en base : la colonne « Fournisseur » sera vide et');
      console.log('    sans liste déroulante. Renseignez la table suppliers au préalable.');
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nÉchec de la génération :', err.message);
  process.exit(1);
});
