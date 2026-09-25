const zlib = require('zlib');

/* Lit le texte réellement imprimé dans un PDF produit par PDFKit.
   Les tests existants ne vérifiaient que la signature et la taille du fichier :
   une facture peut être un PDF parfaitement valide et afficher les mauvais
   libellés. Les tickets ADM-13 à ADM-19 portent précisément sur ce qui est
   écrit, d'où cette lecture du contenu.
   PDFKit encode le texte en hexadécimal dans les opérateurs de flux. */
function extractPdfText(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const streamRe = /stream\r?\n/g;
  let match;
  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let content;
    try {
      content = zlib.inflateSync(buffer.subarray(start, end)).toString('latin1');
    } catch {
      continue; // flux binaire (image du QR code)
    }
    if (!/T[jJ]/.test(content)) continue;
    /* Un bloc BT..ET = une ligne imprimée. PDFKit y découpe le texte en
       plusieurs fragments hexadécimaux pour appliquer le crénage : il faut donc
       les recoller sans séparateur, sinon « Date de facture » ressort en
       morceaux et aucune recherche de libellé ne fonctionne. */
    for (const block of content.split('BT').slice(1)) {
      const body = block.split('ET')[0];
      let line = '';
      const hexRe = /<([0-9a-fA-F]+)>/g;
      let hex;
      while ((hex = hexRe.exec(body)) !== null) {
        line += Buffer.from(hex[1], 'hex').toString('latin1');
      }
      if (line.trim()) out.push(line);
    }
  }
  /* Les caractères accentués sortent en Latin-1 ; « · » sert de séparateur
     d'adresse. On garde le texte brut, ligne à ligne. */
  return out.join('\n');
}

module.exports = { extractPdfText };
