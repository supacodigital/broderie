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

/* ADM-14 — la TVA de la facture est recalculée depuis la composition de la
   commande, FRAIS DE PORT COMPRIS, au centime. */
describe('invoice.service — computeTaxBreakdown()', () => {
  test('commande sans lignes détaillées : taux normal sur articles + port', () => {
    // 49.90 + 8.50 = 58.40 TTC → TVA 8.1 % = 4.38
    const vat = computeTaxBreakdown(makeOrder({ items: [] }));
    expect(vat.parts).toHaveLength(1);
    expect(vat.parts[0].ratePercent).toBe(8.1);
    expect(vat.total).toBe(4.38);
  });

  test('les frais de port portent la TVA des articles (facture 2026-000009)', () => {
    // 33.75 d'articles + 11.25 de port = 45.00 TTC → TVA 3.37 (et non 2.53)
    const items = [{ unit_price: '33.75', quantity: 1, tax_rate_snapshot: '8.10' }];
    const vat = computeTaxBreakdown(makeOrder({ items, subtotal: '33.75', shipping_cost: '11.25', total: '45.00' }));
    expect(vat.total).toBe(3.37);
    expect(vat.parts[0].baseHT).toBe(41.63);
    expect(vat.parts[0].shippingTTC).toBe(11.25);
  });

  test('deux taux : le port est réparti au prorata des articles', () => {
    const items = [
      { unit_price: '75.00', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '25.00', quantity: 1, tax_rate_snapshot: '2.60' },
    ];
    const vat = computeTaxBreakdown(makeOrder({ items, subtotal: '100.00', shipping_cost: '10.00', discount: '0.00' }));
    expect(vat.parts.map((p) => p.ratePercent)).toEqual([2.6, 8.1]);
    expect(vat.parts[0].shippingTTC).toBe(2.5);
    expect(vat.parts[1].shippingTTC).toBe(7.5);
    // 27.50 à 2.6 % → 0.70 ; 82.50 à 8.1 % → 6.18
    expect(vat.parts[0].tvaAmount).toBe(0.7);
    expect(vat.parts[1].tvaAmount).toBe(6.18);
    expect(vat.total).toBe(6.88);
  });

  test('avec remise : la TVA porte sur le montant remisé', () => {
    const items = [{ unit_price: '100.00', quantity: 1, tax_rate_snapshot: '8.10' }];
    // 90 (après remise de 10) + 8.50 de port = 98.50 → 7.38
    const vat = computeTaxBreakdown(makeOrder({ items, subtotal: '90.00', discount: '10.00', shipping_cost: '8.50' }));
    expect(vat.parts[0].itemsTTC).toBe(90);
    expect(vat.total).toBe(7.38);
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
     LTVA art. 26 impose de faire figurer. 15.50 TTC à 8.1 % → 14.34 HT + 1.16
     (TVA au centime). */
  test('détaille le montant hors taxe, la TVA et le total TTC', () => {
    expect(text).toContain('Sous-total HT');
    expect(text).toContain('CHF 14.34');
    expect(text).toContain('TVA 8.1 % sur CHF 14.34');
    expect(text).toContain('CHF 1.16');
    expect(text).toContain('TOTAL TTC');
    expect(text).not.toContain('TVA 8.10 % incluse');
  });

  // ADM-14 — taux lisible ligne par ligne, comme sur les factures de la boutique
  test('affiche le taux de TVA de chaque ligne', () => {
    expect(text).toMatch(/^TVA$/m);
    expect(text).toMatch(/^8\.1 %$/m);
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
  test('porte « Facture N° … du … », sans délai de paiement', async () => {
    const order = {
      id: 32, user_id: 161, created_at: new Date('2026-09-14'),
      invoice_number: '2026-000032', invoice_seq: 32,
      subtotal: '15.50', shipping_cost: '0.00', tax_amount: '1.15', total: '15.50',
      items: [],
    };
    const text = extractPdfText(await generateInvoicePDF({ order, user: makeUser() }));

    // Format des factures de la boutique : « Facture N° 93979 du 15 septembre 2026 »
    expect(text).toContain('Facture N° 2026-000032 du 14 septembre 2026');
    // La phrase précédente débordait du cadre prévu par la norme
    expect(text).not.toContain('payable sous');
  });
});

/* ADM-14 — facture 2026-000009 : « TVA 8.10 % sur CHF 33.75 » pour un total de
   CHF 45.00, les frais de port étaient laissés hors TVA. */
describe('invoice.service — frais de port et remise sur la facture (ADM-14)', () => {
  let text;
  beforeAll(async () => {
    const order = {
      id: 66, user_id: 161, created_at: new Date('2026-09-24T08:00:00Z'),
      invoice_number: '2026-000009', invoice_seq: 9,
      subtotal: '33.75', discount: '3.75', coupon_code: 'PE34-4215',
      shipping_cost: '11.25', tax_amount: '3.37', total: '45.00',
      items: [{
        product_id: 1, quantity: 1, unit_price: '37.50', tax_rate_snapshot: '8.10',
        product_snapshot_json: JSON.stringify({ name: 'Kit diamant', sku: 'WIWD2432' }),
      }],
    };
    text = extractPdfText(await generateInvoicePDF({ order, user: makeUser() }));
  });

  test('la TVA porte aussi sur les frais de port', () => {
    // 45.00 TTC à 8.1 % → 41.63 HT + 3.37
    expect(text).toContain('TVA 8.1 % sur CHF 41.63');
    expect(text).toContain('CHF 3.37');
    expect(text).toContain('Frais de livraison (TVA 8.1 %)');
  });

  test('la remise figure en ligne distincte sous le montant des articles', () => {
    expect(text).toContain('Articles TTC');
    expect(text).toContain('CHF 37.50');
    expect(text).toContain('Remise (PE34-4215)');
    expect(text).toContain('- CHF 3.75');
  });
});

/* CLI-14 — « remises et promotions non visibles : seul le prix final s'affiche
   sur la facture ». Un article vendu en action montre son prix normal barré et
   la mention « En action » avec la remise. */
describe('invoice.service — articles en action sur la facture (CLI-14)', () => {
  let text;
  beforeAll(async () => {
    const order = {
      id: 75, user_id: 667, created_at: new Date('2026-09-24T21:00:00Z'),
      invoice_number: '2026-000017', invoice_seq: 17,
      subtotal: '13.00', shipping_cost: '8.50', tax_amount: '1.61', total: '21.50',
      items: [
        { product_id: 232, quantity: 1, unit_price: '1.50', tax_rate_snapshot: '8.10',
          product_snapshot_json: JSON.stringify({ name: 'DMC mouliné N° 3045', sku: 'DMC3045', compare_price_chf: '2.00' }) },
        // Vente à la coupe : prix barré au mètre (4.00), prix facturé au tronçon de 10 cm
        { product_id: 1828, quantity: 5, unit_price: '0.30', tax_rate_snapshot: '8.10',
          sold_by_length: 1, length_step_cm: 10,
          product_snapshot_json: JSON.stringify({ name: 'Vaupel, bande à broder', sku: '212-025', compare_price_chf: '4.00' }) },
        { product_id: 1493, quantity: 1, unit_price: '10.00', tax_rate_snapshot: '8.10',
          product_snapshot_json: JSON.stringify({ name: 'Graziano, tissu', sku: 'TA8279', compare_price_chf: null }) },
      ],
    };
    text = extractPdfText(await generateInvoicePDF({ order, user: makeUser() }));
  });

  test('mention « En action » avec la remise, pour chaque article en action', () => {
    expect(text.match(/En action -25 %/g)).toHaveLength(2);
  });

  test('prix normal affiché à la même unité que le prix facturé', () => {
    expect(text).toContain('CHF 2.00');
    expect(text).toContain('CHF 0.40'); // 4.00 le mètre → 0.40 les 10 cm
    expect(text).not.toContain('CHF 4.00');
  });

  test('un article hors action reste inchangé, les totaux aussi', () => {
    expect(text).toContain('CHF 10.00');
    expect(text).toContain('CHF 21.50');
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
