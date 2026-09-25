#!/usr/bin/env node
/* ============================================================
 * Liste officielle des NPA suisses → backend/data/swissLocalities.json
 *
 * Source : « Répertoire officiel des localités avec NPA » de swisstopo,
 * gratuit, mis à jour chaque mois :
 *   https://data.geo.admin.ch/browser/index.html#/collections/ch.swisstopo-vd.ortschaftenverzeichnis_plz
 *
 * Seuls les NPA de domicile y figurent (une localité avec un périmètre) :
 * pas de case postale ni de NPA d'entreprise — un colis ne s'y livre pas.
 * On ne garde que la Suisse : le Liechtenstein (sans canton dans la source),
 * Büsingen et Campione (absents de la source) sont exclus.
 *
 * Format produit : { "1510": [["Moudon", "VD"], ["Syens", "VD"]], ... }
 * Localités triées par ordre alphabétique. Une localité à cheval sur deux
 * cantons (« Versoix » GE et VD sous le 1290) n'est gardée que dans le canton
 * qui porte l'essentiel de ses adresses.
 *
 * Usage (depuis backend/) :
 *   node scripts/update-swiss-localities.js
 *   node scripts/update-swiss-localities.js --csv /chemin/AMTOVZ_CSV_WGS84.csv
 * Nécessite la commande `unzip` quand le fichier est téléchargé.
 * ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SOURCE_URL = 'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip';
const OUTPUT = path.join(__dirname, '..', 'data', 'swissLocalities.json');

// Les 26 cantons : toute autre valeur (vide = Liechtenstein) est écartée
const CANTONS = new Set(['AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NE',
  'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH']);

const args = process.argv.slice(2);
const csvArg = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;

// Télécharge l'archive swisstopo et en extrait le CSV (texte UTF-8)
const downloadCsv = async () => {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Téléchargement refusé (HTTP ${response.status})`);
  const zipPath = path.join(os.tmpdir(), `swiss-localities-${Date.now()}.zip`);
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  try {
    return execFileSync('unzip', ['-p', zipPath, '*.csv'], { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  } finally {
    fs.unlinkSync(zipPath);
  }
};

// CSV swisstopo : séparateur « ; », BOM et fins de ligne CRLF, aucun champ entre guillemets
const buildLocalities = (csv) => {
  const [header, ...lines] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const columns = header.split(';');
  const col = (name) => {
    const index = columns.indexOf(name);
    if (index === -1) throw new Error(`Colonne « ${name} » absente : le format de la source a changé`);
    return index;
  };
  const [iName, iZip, iCanton, iShare] = [col('Ortschaftsname'), col('PLZ4'), col('Kantonskürzel'), col('Adressenanteil')];

  // NPA → localité → canton → part d'adresses cumulée (une localité peut couvrir plusieurs communes)
  const shares = new Map();
  for (const line of lines) {
    const cells = line.split(';');
    const [zip, name, canton] = [cells[iZip], cells[iName]?.trim(), cells[iCanton]];
    if (!/^[1-9]\d{3}$/.test(zip) || !name || !CANTONS.has(canton)) continue;
    const share = parseFloat(String(cells[iShare]).replace('%', '')) || 0;
    const byLocality = shares.get(zip) ?? new Map();
    const byCanton = byLocality.get(name) ?? new Map();
    byCanton.set(canton, (byCanton.get(canton) ?? 0) + share);
    byLocality.set(name, byCanton);
    shares.set(zip, byLocality);
  }

  const result = {};
  for (const zip of [...shares.keys()].sort()) {
    result[zip] = [...shares.get(zip).entries()]
      // Canton principal de la localité : celui qui porte le plus d'adresses
      .map(([name, byCanton]) => [name, [...byCanton.entries()].sort((a, b) => b[1] - a[1])[0][0]])
      .sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }
  return result;
};

(async () => {
  const csv = csvArg ? fs.readFileSync(csvArg, 'utf8') : await downloadCsv();
  const localities = buildLocalities(csv);
  const count = Object.keys(localities).length;
  // Garde-fou : une source tronquée ne doit pas remplacer la liste (≈ 3 200 NPA)
  if (count < 3000) throw new Error(`Seulement ${count} NPA lus : fichier source incomplet, liste inchangée`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(localities)}\n`);
  console.log(`${count} NPA suisses écrits dans ${path.relative(process.cwd(), OUTPUT)}`);
})().catch((err) => {
  console.error(`Échec : ${err.message}`);
  process.exit(1);
});
