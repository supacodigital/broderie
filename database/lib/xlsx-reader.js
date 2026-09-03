/* ============================================================
 * Lecteur XLSX minimal — sans dépendance.
 *
 * Un fichier .xlsx est une archive ZIP contenant du XML. Ce module lit
 * l'archive (ZIP « stored » ou « deflate ») puis parse la première feuille.
 * Il couvre exactement ce dont l'import du catalogue a besoin :
 *   - cellules inlineStr (chaînes en clair dans la feuille)
 *   - cellules sharedStrings (table de chaînes partagée)
 *   - cellules numériques et booléennes (t="b" → "0"/"1")
 *
 * Ne gère PAS : styles, formats de date, formules, feuilles multiples.
 * Les dates Excel restent des nombres « série » (jours depuis 1899-12-30) —
 * la conversion se fait côté appelant si besoin (voir excelSerialToDate).
 *
 * Utilisé par database/import-catalog.js.
 * ============================================================ */

const fs = require('fs');
const zlib = require('zlib');

// ── Lecture ZIP (central directory) ────────────────────────
const readZipEntries = (buf) => {
  const entries = {};

  // Fin du central directory (End Of Central Directory record) : signature 0x06054b50
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Archive .xlsx invalide : EOCD introuvable');

  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break; // signature central file header
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    // En-tête local : on relit les longueurs (elles peuvent différer du central)
    const lhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compressedSize);

    let content;
    if (method === 0) content = compData;                       // stored
    else if (method === 8) content = zlib.inflateRawSync(compData); // deflate
    else throw new Error(`Méthode de compression ZIP non supportée : ${method}`);

    entries[name] = content;
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
};

// ── Décodage des entités XML ───────────────────────────────
const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&'); // en dernier — sinon double décodage

// ── Colonne "AB" → index 0-based ───────────────────────────
const columnLetterToIndex = (letters) => {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// ── Parsing d'une feuille ──────────────────────────────────
const parseSheet = (xml, sharedStrings) => {
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>|<row[^>]*\/>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xml))) {
    const rowInner = rowMatch[1] || '';
    const cells = {};
    const cellRegex = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowInner))) {
      const colIndex = columnLetterToIndex(cellMatch[1]);
      const attrs = cellMatch[2] || '';
      const inner = cellMatch[3] || '';
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : 'n';

      let value = null;
      if (type === 's') {
        // Référence dans la table sharedStrings
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) value = sharedStrings[Number(v[1])] ?? null;
      } else if (type === 'inlineStr') {
        const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (t) value = decodeXml(t[1]);
      } else if (type === 'str') {
        // Résultat texte de formule
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) value = decodeXml(v[1]);
      } else {
        // 'n' (nombre) ou 'b' (booléen : Excel stocke "0"/"1")
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) value = v[1];
      }

      cells[colIndex] = value;
    }

    rows.push(cells);
  }

  return rows;
};

// ── API publique ───────────────────────────────────────────

/**
 * Lit la première feuille d'un .xlsx et renvoie un tableau de lignes.
 * Chaque ligne est un objet { [colIndex]: valeur|null }.
 */
const readSheetRows = (filePath) => {
  const buf = fs.readFileSync(filePath);
  const entries = readZipEntries(buf);

  // Table des chaînes partagées (absente si la feuille n'utilise que inlineStr)
  const sharedStrings = [];
  if (entries['xl/sharedStrings.xml']) {
    const ss = entries['xl/sharedStrings.xml'].toString('utf8');
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRegex.exec(ss))) {
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch;
      const parts = [];
      while ((tMatch = tRegex.exec(siMatch[1]))) parts.push(decodeXml(tMatch[1]));
      sharedStrings.push(parts.join(''));
    }
  }

  const sheetXml = entries['xl/worksheets/sheet1.xml'];
  if (!sheetXml) throw new Error(`${filePath} : xl/worksheets/sheet1.xml introuvable`);

  return parseSheet(sheetXml.toString('utf8'), sharedStrings);
};

/**
 * Comme readSheetRows, mais mappe chaque ligne sur un objet dont les clés sont
 * les libellés de la première ligne (en-tête).
 */
const readSheetObjects = (filePath) => {
  const rows = readSheetRows(filePath);
  if (rows.length === 0) return [];

  // Largeur maximale (sans spread — les fichiers font des dizaines de milliers de lignes)
  let maxCol = 0;
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const n = Number(key);
      if (n > maxCol) maxCol = n;
    }
  }

  const headers = [];
  for (let i = 0; i <= maxCol; i++) {
    const raw = rows[0][i];
    headers[i] = raw != null ? String(raw).trim() : `col${i}`;
  }

  return rows.slice(1).map((row) => {
    const obj = {};
    for (let i = 0; i <= maxCol; i++) {
      obj[headers[i]] = row[i] != null ? row[i] : null;
    }
    return obj;
  });
};

/**
 * Convertit un nombre « série » Excel (jours depuis 1899-12-30) en objet Date.
 * Renvoie null si la valeur n'est pas un nombre exploitable.
 */
const excelSerialToDate = (serial) => {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 1899-12-30 est l'époque Excel (le bug 1900 est déjà compensé par ce choix)
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
};

module.exports = { readSheetRows, readSheetObjects, excelSerialToDate };
