/* Génération de CSV sûre pour Excel / LibreOffice / Google Sheets.

   Deux risques traités :
   1. Injection de formule (CSV injection) : une valeur commençant par = + - @
      (ou tab / CR) est interprétée comme une formule à l'ouverture du fichier.
      → on préfixe ces valeurs d'une apostrophe, neutralisée par le tableur.
   2. Cassure de structure : séparateur, guillemet ou retour ligne dans une
      valeur → on entoure de guillemets et on double les guillemets internes. */

// Caractères qui déclenchent l'évaluation d'une formule en tête de cellule
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

// Neutralise une valeur unique : renvoie toujours une chaîne prête à écrire
const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '';

  let str = String(value);

  // 1. Anti-injection de formule : apostrophe en tête si caractère déclencheur
  if (str.length > 0 && FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`;
  }

  // 2. Échappement structurel si le contenu contient , " \n ou \r
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

// Assemble une ligne CSV à partir d'un tableau de valeurs
const toCsvRow = (values) => values.map(escapeCsvValue).join(',');

/* Construit un document CSV complet.
   headers : string[]  ·  rows : any[][]
   Préfixe un BOM UTF-8 pour qu'Excel détecte l'encodage. */
const buildCsv = (headers, rows) => {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)];
  return '﻿' + lines.join('\r\n') + '\r\n';
};

module.exports = { escapeCsvValue, toCsvRow, buildCsv };
