// Tests unitaires invoice.service — génération PDF facture

const zlib = require('zlib');
const { generateInvoicePDF, computeTaxBreakdown, generateQrReference } = require('../../services/invoice.service');
const { roundCHF } = require('../../utils/chf.utils');

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

function makeOrder(overrides = {}) {
  return {
    id: 1042,
    created_at: new Date('2026-05-01'),
    subtotal: '49.90',
    shipping_cost: '8.50',
    tax_amount: '3.74',
    total: '58.40',
    items: [],
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    first_name: 'Julie',
    last_name: 'Test',
    email: 'julie@broderie.ch',
    ...overrides,
  };
}

describe('invoice.service — generateQrReference()', () => {
  test('préfixe APC et tient dans VARCHAR(27)', () => {
    const ref = generateQrReference();
    expect(ref).toMatch(/^APC[0-9A-Z]+$/);
    expect(ref.length).toBeLessThanOrEqual(27);
  });

  test('produit des références uniques (source crypto)', () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateQrReference()));
    expect(refs.size).toBe(500);
  });
});

/* Non-régression : format de facture « AAAA-NNNNNN » demandé par la cliente.
   Avec un QR-IBAN, la référence doit être structurée (27 chiffres) et intégrer
   l'année — sans quoi le compteur, remis à 1 chaque 1er janvier, produirait la
   même référence en 2026 et en 2027 et la banque rapprocherait le paiement sur
   la mauvaise facture. */
describe('invoice.service — référence structurée avec QR-IBAN', () => {
  const QR_IBAN = 'CH9330000001167981317'; // QR-IBAN PostFinance de la boutique

  let generateWithQrIban;
  let isQRReference;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({
      ...jest.requireActual('../../config/env'),
      qrInvoiceIban: QR_IBAN,
    }));
    ({ generateQrReference: generateWithQrIban } = require('../../services/invoice.service'));
    ({ isQRReference } = require('swissqrbill/utils'));
  });

  afterAll(() => {
    jest.dontMock('../../config/env');
    jest.resetModules();
  });

  test('l’IBAN PostFinance de la boutique est bien un QR-IBAN', () => {
    const { isQRIBAN } = require('swissqrbill/utils');
    expect(isQRIBAN(QR_IBAN)).toBe(true);
  });

  test('produit 27 chiffres avec une clé de contrôle valide', () => {
    const ref = generateWithQrIban(1, 2026);
    expect(ref).toHaveLength(27);
    expect(ref).toMatch(/^\d{27}$/);
    expect(isQRReference(ref)).toBe(true);
  });

  test('encode l’année et le compteur sur 6 chiffres', () => {
    // 2026 + 000042 → « …0000 2026 000042 » + clé de contrôle
    expect(generateWithQrIban(42, 2026).slice(0, 26)).toMatch(/0{16}2026000042$/);
  });

  test('deux années différentes ne partagent pas la même référence', () => {
    expect(generateWithQrIban(1, 2026)).not.toBe(generateWithQrIban(1, 2027));
  });

  test('sans numéro de séquence, retombe sur la référence interne', () => {
    expect(generateWithQrIban(null)).toMatch(/^APC/);
  });
});

describe('invoice.service — generateInvoicePDF()', () => {
  test('retourne un Buffer non vide', async () => {
    const buf = await generateInvoicePDF({ order: makeOrder(), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('le Buffer commence par la signature PDF (%PDF)', async () => {
    const buf = await generateInvoicePDF({ order: makeOrder(), user: makeUser() });

    expect(buf.toString('ascii', 0, 4)).toBe('%PDF');
  });

  test('fonctionne sans items (commande vide)', async () => {
    const buf = await generateInvoicePDF({ order: makeOrder({ items: [] }), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('fonctionne avec plusieurs articles incluant un SKU', async () => {
    const items = [
      {
        product_id: 1, quantity: 2, unit_price: '24.95', tax_rate_snapshot: '8.10',
        product_snapshot_json: JSON.stringify({ name: 'Fil DMC rouge', sku: 'DMC-321' }),
      },
      {
        product_id: 2, quantity: 1, unit_price: '12.50', tax_rate_snapshot: '8.10',
        product_snapshot_json: JSON.stringify({ name: 'Aiguille broderie' }),
      },
    ];
    // 24.95*2 + 12.50 = 62.40 TTC ; TVA 8.1 % incluse ≈ 4.68
    const order = makeOrder({ items, subtotal: '62.40', discount: '0.00', tax_amount: '4.68', total: '70.90' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('fonctionne avec product_snapshot_json déjà parsé (objet)', async () => {
    const items = [
      {
        product_id: 3, quantity: 1, unit_price: '8.90', tax_rate_snapshot: '8.10',
        product_snapshot_json: { name: 'Canevas', sku: 'CNV-01' },
      },
    ];
    const order = makeOrder({ items, subtotal: '8.90', discount: '0.00', tax_amount: '0.67', total: '17.40' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('gère un article sans product_snapshot_json (fallback nom générique)', async () => {
    const items = [
      { product_id: 5, quantity: 1, unit_price: '5.00', tax_rate_snapshot: '8.10', product_snapshot_json: null },
    ];
    const order = makeOrder({ items, subtotal: '5.00', discount: '0.00', tax_amount: '0.37', total: '13.50' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('facture avec plusieurs taux de TVA : génération OK', async () => {
    const items = [
      { product_id: 1, quantity: 1, unit_price: '108.10', tax_rate_snapshot: '8.10',
        product_snapshot_json: { name: 'Kit' } },
      { product_id: 2, quantity: 1, unit_price: '102.60', tax_rate_snapshot: '2.60',
        product_snapshot_json: { name: 'Livre' } },
    ];
    const order = makeOrder({ items, subtotal: '210.70', tax_amount: '10.70', total: '219.20', discount: '0.00' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });
    expect(buf.toString('ascii', 0, 4)).toBe('%PDF');
  });
});

describe('invoice.service — computeTaxBreakdown()', () => {
  test('commande sans items : tableau vide', () => {
    expect(computeTaxBreakdown(makeOrder({ items: [] }))).toEqual([]);
  });

  test('un seul taux : la somme des TVA ventilées == order.tax_amount', () => {
    const items = [
      { unit_price: '54.05', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '54.05', quantity: 1, tax_rate_snapshot: '8.10' },
    ];
    const order = makeOrder({ items, subtotal: '108.10', discount: '0.00', tax_amount: '8.10' });
    const parts = computeTaxBreakdown(order);
    expect(parts).toHaveLength(1);
    expect(roundCHF(parts.reduce((s, p) => s + p.tvaAmount, 0))).toBe(8.10);
  });

  test('deux taux : la somme des TVA ventilées == order.tax_amount', () => {
    const items = [
      { unit_price: '108.10', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '102.60', quantity: 1, tax_rate_snapshot: '2.60' },
    ];
    // TVA réelle : 8.10 (sur 108.10) + 2.60 (sur 102.60) = 10.70
    const order = makeOrder({ items, subtotal: '210.70', discount: '0.00', tax_amount: '10.70' });
    const parts = computeTaxBreakdown(order);
    expect(parts.map((p) => p.ratePercent)).toEqual([2.6, 8.1]);
    expect(roundCHF(parts.reduce((s, p) => s + p.tvaAmount, 0))).toBe(10.70);
  });

  test('avec remise : réconcilie toujours avec order.tax_amount', () => {
    const items = [
      { unit_price: '100.00', quantity: 1, tax_rate_snapshot: '8.10' },
    ];
    // subtotal stocké 90 (après remise 10), tax_amount recalculé côté order.service
    const order = makeOrder({ items, subtotal: '90.00', discount: '10.00', tax_amount: '6.75' });
    const parts = computeTaxBreakdown(order);
    expect(roundCHF(parts.reduce((s, p) => s + p.tvaAmount, 0))).toBe(6.75);
  });
});

/* ── Mentions obligatoires de la facture — tickets ADM-13 à ADM-19 ──
   La cliente a relevé huit manquements sur le document remis à ses clientes.
   Ces tests lisent le texte imprimé, seul moyen de vérifier ce qu'elle voit. */
describe('invoice.service — mentions légales de la facture', () => {
  const ORDER = {
    id: 32,
    user_id: 161,
    created_at: new Date('2026-09-14'),
    invoice_number: '2026-000032',
    invoice_seq: 32,
    subtotal: '15.50',
    shipping_cost: '0.00',
    tax_amount: '1.15',
    total: '15.50',
    items: [{
      product_id: 1, quantity: 1, unit_price: '15.50', tax_rate_snapshot: '8.10',
      product_snapshot_json: JSON.stringify({ name: 'Kit diamant', sku: 'WIWD2432' }),
    }],
  };

  let text;
  beforeAll(async () => {
    text = extractPdfText(await generateInvoicePDF({ order: ORDER, user: makeUser() }));
  });

  // ADM-15 — « Date » seul ne suffit pas en comptabilité
  test('porte la mention « Date de facture »', () => {
    expect(text).toContain('Date de facture :');
  });

  // ADM-17 — traçabilité comptable
  test('porte un numéro de client', () => {
    expect(text).toMatch(/N° client : C\d{6}/);
  });

  /* ADM-18 — l'année fait partie du numéro : sans elle, le compteur repartant à 1
     chaque janvier produirait deux factures « 000032 » à un an d'intervalle. */
  test('numérote la facture avec son année', () => {
    expect(text).toContain('N° 2026-000032');
  });

  /* ADM-14 — « TVA incluse » ne permet pas de lire le montant hors taxe, que la
     LTVA art. 26 impose de faire figurer. 15.50 TTC à 8.1 % → 14.35 HT + 1.15. */
  test('détaille le montant hors taxe, la TVA et le total TTC', () => {
    expect(text).toContain('Total hors taxe (HT)');
    expect(text).toContain('CHF 14.35');
    expect(text).toContain('TVA 8.10 % sur CHF 14.35');
    expect(text).toContain('TOTAL TTC');
    expect(text).not.toContain('TVA 8.10 % incluse');
  });

  // ADM-13 — le logo est une image, il ne vaut pas mention de l'émetteur
  test('porte la raison sociale en toutes lettres', () => {
    expect(text).toContain('Au Point-Compté');
  });
});

/* ADM-19 — le champ « Informations supplémentaires » du bulletin est limité à
   140 caractères par les spécifications SIX et attend une référence de facture,
   pas une phrase. */
describe('invoice.service — champ « Informations supplémentaires » (ADM-19)', () => {
  test('ne porte que le numéro de facture, sans délai de paiement', async () => {
    const order = {
      id: 32, user_id: 161, created_at: new Date('2026-09-14'),
      invoice_number: '2026-000032', invoice_seq: 32,
      subtotal: '15.50', shipping_cost: '0.00', tax_amount: '1.15', total: '15.50',
      items: [],
    };
    const text = extractPdfText(await generateInvoicePDF({ order, user: makeUser() }));

    expect(text).toContain('Facture 2026-000032');
    // La phrase précédente débordait du cadre prévu par la norme
    expect(text).not.toContain('Facture 2026-000032 — payable sous');
  });
});

/* Non-régression — bascule vers le QR-IBAN.
   Avec un QR-IBAN, le standard EXIGE une référence structurée : sans elle la
   génération échoue. Les commandes antérieures n'en ont pas, ou portent une
   ancienne référence interne « APC… » non numérique. Régénérer leur facture ne
   doit pas planter. */
describe('invoice.service — factures antérieures à la numérotation', () => {
  const base = {
    id: 29, user_id: 161, created_at: new Date('2026-09-10'),
    subtotal: '22.50', shipping_cost: '0.00', tax_amount: '1.69', total: '22.50',
    items: [],
  };

  test('génère la facture d\'une commande sans référence', async () => {
    const buf = await generateInvoicePDF({ order: { ...base, qr_reference: null }, user: makeUser() });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('génère la facture d\'une commande portant une ancienne référence interne', async () => {
    const order = { ...base, qr_reference: 'APCMU0WJ7F1C842FCA2' };
    const buf = await generateInvoicePDF({ order, user: makeUser() });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
