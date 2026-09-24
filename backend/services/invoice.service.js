const path             = require('path');
const crypto           = require('crypto');
const PDFDocument     = require('pdfkit');
const { SwissQRBill } = require('swissqrbill/pdf');
const { isQRIBAN, calculateQRReferenceChecksum } = require('swissqrbill/utils');
const { roundCHF }    = require('../utils/chf.utils');
const { computeOrderVat } = require('../utils/tva.utils');
const env             = require('../config/env');
const emailService    = require('./email.service');
const { AppError }    = require('../middlewares/errorHandler');

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

// IBAN de test public (UBS) livré par défaut — refuser d'émettre une facture avec lui en production
const TEST_IBAN = 'CH9300762011623852957';

/* TVA de la facture, ventilée par taux, frais de port compris (ADM-14).
   Recalculée depuis la composition de la commande avec le MÊME calcul que celui
   stocké à la création (utils/tva.utils.js) — et non plus relue dans
   orders.tax_amount : les commandes antérieures au 24.09.2026 y portent une TVA
   calculée sans les frais de port, qu'une facture régénérée ne doit pas recopier. */
const computeTaxBreakdown = (order) => computeOrderVat({
  items:              order.items || [],
  discountedSubtotal: parseFloat(order.subtotal),
  shippingCost:       parseFloat(order.shipping_cost) || 0,
});

// Taux affiché comme sur les factures de la boutique : « 8.1 », pas « 8.10 »
const formatRate = (ratePercent) => String(Number(Number(ratePercent).toFixed(2)));

// ─────────────────────────────────────────────────────────────
// Références de paiement
//
// Deux formats coexistent, car ils dépendent du type d'IBAN configuré :
//
//   • QR-IBAN  → référence QR STRUCTURÉE (27 chiffres, dont 1 de contrôle).
//     C'est le format que la banque lit et rapproche automatiquement, et celui
//     de la facture de référence transmise par la cliente. Le numéro de facture
//     y est encodé, complété par des zéros à gauche.
//
//   • IBAN classique → la référence structurée est INTERDITE par le standard.
//     On retombe sur une référence interne placée dans le message libre ; le
//     rapprochement reste alors manuel.
//
// Le choix est automatique (isQRIBAN) : passer au QR-IBAN dans la configuration
// suffit à activer la référence structurée, sans modifier le code.
// ─────────────────────────────────────────────────────────────

/* Référence QR structurée : 26 chiffres + 1 de contrôle.
   On encode ANNÉE (4) + compteur (6), complété par des zéros à gauche, soit le
   numéro de facture « 2026-000001 » sans son tiret → …0000 2026 000001 + clé.
   L'année est indispensable : le compteur repart à 1 chaque 1er janvier, donc
   le seul numéro de séquence donnerait la même référence en 2026 et en 2027 —
   la banque rapprocherait le paiement sur la mauvaise facture. */
const buildStructuredReference = (invoiceSeq, year = new Date().getFullYear()) => {
  const numeric = `${String(year)}${String(invoiceSeq).replace(/\D/g, '').padStart(6, '0')}`;
  const base    = numeric.padStart(26, '0').slice(-26);
  return base + calculateQRReferenceChecksum(base);
};

// Référence interne — repli quand l'IBAN n'est pas un QR-IBAN.
// Suffixe tiré de crypto.randomBytes : Math.random() est prévisible et deux
// commandes de la même milliseconde pourraient collisionner.
const buildInternalReference = () => {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `APC${ts}${rand}`;
};

// Un QR-IBAN impose une référence structurée ; un IBAN classique l'interdit.
const usesStructuredReference = () => isQRIBAN(String(env.qrInvoiceIban || '').replace(/\s/g, ''));

/* Conservé pour les commandes créées avant la numérotation des factures :
   la référence est alors générée sans connaître le numéro de facture. */
const generateQrReference = (invoiceSeq = null, year = new Date().getFullYear()) => (
  usesStructuredReference() && invoiceSeq
    ? buildStructuredReference(invoiceSeq, year)
    : buildInternalReference()
);

// Date d'échéance de la facture (aujourd'hui + délai configuré, défaut 30 jours)
const computeDueDate = (dueDays = null) => {
  const due = new Date();
  due.setDate(due.getDate() + (dueDays ?? env.invoiceDueDays ?? 30));
  return due;
};

/* Numéro de client imprimé sur la facture (ADM-17). Dérivé de l'identifiant du
   compte, complété à 6 chiffres — une cliente doit pouvoir le citer au téléphone
   et le retrouver dans l'administration. */
const formatCustomerNumber = (userId) => `C${String(userId ?? 0).padStart(6, '0')}`;

/* Repli de numéro de facture pour les commandes créées avant la numérotation.
   Porte l'année de la commande, comme un vrai numéro (ADM-18) : un « 000032 » nu
   ne se classe pas et se répète d'une année sur l'autre. */
const invoiceFallbackNumber = (order) => {
  const year = new Date(order.created_at ?? Date.now()).getFullYear();
  return `${year}-${String(order.id).padStart(6, '0')}`;
};

/* Référence structurée utilisable pour ce bulletin, quelle que soit l'histoire
   de la commande. Une référence déjà stockée n'est réutilisée que si elle est
   bien numérique : les anciennes références internes « APC… » ne le sont pas. */
const resolveStructuredReference = (order) => {
  const stored = String(order.qr_reference ?? '');
  if (/^\d{27}$/.test(stored)) return stored;
  const year = new Date(order.created_at ?? Date.now()).getFullYear();
  const seq  = order.invoice_seq
    ?? String(order.invoice_number ?? '').split('-').pop()
    ?? order.id;
  return buildStructuredReference(seq || order.id, year);
};

/* Dates à l'heure suisse : le serveur tourne en UTC, et une commande passée à
   00h30 à Vucherens aurait porté la date de la veille. */
const formatDate = (date) => new Date(date)
  .toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' });

// « 15 septembre 2026 » — date en toutes lettres du bulletin QR
const formatLongDate = (date) => new Date(date)
  .toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });

// Construit l'objet de données attendu par SwissQRBill à partir d'une commande
const buildQrBillData = (order, issuer = null) => {
  const structured = usesStructuredReference();
  // Numéro de facture porté par le bulletin — l'année en fait partie (ADM-18)
  const invoiceLabel = order.invoice_number ?? invoiceFallbackNumber(order);
  // Le débiteur de la facture QR est l'adresse de FACTURATION.
  // Fallback sur la livraison pour les commandes créées avant l'ajout du billing.
  const billStreet       = order.billing_street        ?? order.shipping_street;
  const billStreetNumber = order.billing_street_number  ?? order.shipping_street_number;
  const billCity         = order.billing_city           ?? order.shipping_city;
  const billZip          = order.billing_zip            ?? order.shipping_zip;
  const billFirst        = order.billing_first_name ?? order.shipping_first_name ?? order.first_name;
  const billLast         = order.billing_last_name  ?? order.shipping_last_name  ?? order.last_name;
  return {
    amount:   roundCHF(parseFloat(order.total)),
    currency: 'CHF',
    creditor: {
      // Le QR-IBAN reste dans la configuration serveur : donnée bancaire
      account: env.qrInvoiceIban,
      name:    issuer?.name    ?? env.qrInvoiceName,
      address: issuer?.address ?? env.qrInvoiceAddress,
      city:    issuer?.city    ?? env.qrInvoiceCity,
      zip:     parseInt(issuer?.zip ?? env.qrInvoiceZip, 10) || (issuer?.zip ?? env.qrInvoiceZip),
      country: 'CH',
    },
    debtor: {
      name:           `${billFirst ?? ''} ${billLast ?? ''}`.trim() || 'Client',
      address:        billStreet || 'Adresse',
      buildingNumber: billStreetNumber || undefined,
      city:           billCity || '',
      zip:            parseInt(billZip, 10) || billZip || 0,
      country:        'CH',
    },
    /* Avec un QR-IBAN, la référence part dans le champ structuré « Référence » du
       bulletin — c'est lui que la banque rapproche automatiquement. Le champ libre
       ne porte alors qu'un rappel lisible du numéro de facture.
       Avec un IBAN classique, la référence structurée est refusée par le standard :
       on remet l'identifiant dans le message, et le rapprochement reste manuel. */
    /* Avec un QR-IBAN, le standard EXIGE une référence structurée : sans elle la
       génération échoue (« If there is no reference, a conventional IBAN must be
       used »). Deux cas laissent une commande sans référence utilisable :
         - commande créée avant la mise en place de la numérotation ;
         - commande créée du temps d'un IBAN classique, qui porte alors une
           référence interne « APC… », non numérique et refusée par le standard.
       Dans ces deux cas on reconstruit une référence structurée à partir du
       numéro de facture — régénérer une ancienne facture ne doit pas planter. */
    ...(structured ? { reference: resolveStructuredReference(order) } : {}),
    /* Champ « Informations supplémentaires » du bulletin (ADM-19), au format des
       factures de la boutique : « Facture N° 2026-000009 du 24 septembre 2026 ».
       Les spécifications SIX le limitent à 140 caractères (message non structuré)
       et au jeu de caractères latin — « ° » et les accents en font partie ; le
       tiret cadratin non, il est évité. Le délai de paiement ne s'y met pas : il
       figure sur la facture. Tronqué par sécurité : un numéro anormalement long ne
       doit pas produire un bulletin invalide. */
    message: `Facture N° ${invoiceLabel} du ${formatLongDate(order.created_at ?? Date.now())}`.slice(0, 140),
  };
};

// Palette et constantes de mise en page partagées par tout le document
const COLORS = {
  rose:      '#be185d',
  roseLight: '#fdf2f8',
  dark:      '#1a0a1e',
  muted:     '#6b7280',
  border:    '#e5e7eb',
  rowAlt:    '#faf9fb',
};
const PAGE_MARGIN  = 50;
const CONTENT_W    = 495; // largeur utile (595 - 2×50)
/* Colonne « TVA » par ligne, comme sur les factures de la boutique (ADM-14) :
   le taux appliqué à chaque article se lit sans calcul. */
const TABLE_COLS   = { name: 55, nameW: 215, qty: 270, qtyW: 40, price: 310, priceW: 80, vat: 390, vatW: 50, total: 440, totalW: 105 };
// Hauteur réservée en bas de la dernière page pour le bulletin QR suisse (bulletin
// officiel ≈ 105mm ≈ 297pt) — le tableau ne doit jamais empiéter dessus.
const QR_BILL_HEIGHT = 300;
const PAGE_BOTTOM    = 792 - PAGE_MARGIN; // A4 = 842pt de haut, marge basse identique à la marge haute

// ─────────────────────────────────────────────────────────────
// Génère un PDF de facture (Buffer) : facture détaillée + QR-facture suisse
// Signature conservée { order, user } — utilisée par l'admin et le flux client
// ─────────────────────────────────────────────────────────────
/* `settings` provient de shopSettings.service (valeurs saisies dans l'admin).
   Optionnel : sans lui on retombe sur la configuration serveur, ce qui garde
   les appels existants et les tests valides. */
const generateInvoicePDF = ({ order, user, settings = null }) => {
  const issuer = {
    name:      settings?.name      ?? env.qrInvoiceName,
    address:   settings?.address   ?? env.qrInvoiceAddress,
    zip:       settings?.zip       ?? env.qrInvoiceZip,
    city:      settings?.city      ?? env.qrInvoiceCity,
    vatNumber: settings?.vatNumber ?? env.qrInvoiceVatNumber,
    dueDays:   settings?.dueDays   ?? env.invoiceDueDays ?? 30,
  };
  return new Promise((resolve, reject) => {
    try {
      // Garde-fou : ne jamais émettre une facture avec l'IBAN de test en production
      if (env.nodeEnv === 'production' && env.qrInvoiceIban === TEST_IBAN) {
        throw new AppError('IBAN de facturation non configuré (IBAN de test détecté en production).', 500);
      }

      const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end',  ()      => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { rose, roseLight, dark, muted, border, rowAlt } = COLORS;
      const dueDays = env.invoiceDueDays || 30;

      // ── En-tête : logo + bloc FACTURE ──────────────────────────
      // Logo redimensionné à une hauteur fixe, ratio préservé (source 2720×1360)
      doc.image(LOGO_PATH, PAGE_MARGIN, 44, { height: 46 });

      /* Raison sociale en toutes lettres (ADM-13) — le logo est une image, il ne
         vaut pas mention de l'émetteur sur un document comptable. */
      doc.fontSize(10).fillColor(dark).font('Helvetica-Bold')
         .text(issuer.name, PAGE_MARGIN, 96);

      doc.fontSize(9).fillColor(muted).font('Helvetica')
         .text(`${issuer.address} · ${issuer.zip} ${issuer.city}`, PAGE_MARGIN, 110);

      // N° TVA du vendeur — imprimé seulement si la boutique est assujettie (LTVA art. 26)
      if (issuer.vatNumber) {
        doc.text(`N° TVA : ${issuer.vatNumber}`, PAGE_MARGIN, 122);
      }

      doc.fontSize(24).fillColor(dark).font('Helvetica-Bold')
         .text('FACTURE', 350, 46, { align: 'right', width: 195 });

      doc.fontSize(9).fillColor(muted).font('Helvetica')
         /* Numéro de facture au format « 2026-000001 » — lisible et classable en
            comptabilité. Le numéro de commande reste affiché en dessous : c'est
            lui que la cliente retrouve dans l'administration. */
         /* Numéro de facture au format « 2026-000001 » (ADM-18) — l'année fait
            partie du numéro : sans elle, le compteur repartant à 1 chaque janvier
            produirait deux factures « 000032 » à un an d'intervalle. Le repli ne
            sert qu'aux commandes antérieures à la numérotation. */
         .text(`N° ${order.invoice_number ?? invoiceFallbackNumber(order)}`, 350, 78,  { align: 'right', width: 195 })
         .text(`Commande n° ${order.id}`,                           350, 92,  { align: 'right', width: 195 })
         // « Date de facture » et non « Date » : exigence comptable (ADM-15)
         .text(`Date de facture : ${formatDate(order.created_at)}`, 350, 106, { align: 'right', width: 195 })
         // Numéro de client — traçabilité comptable (ADM-17)
         .text(`N° client : ${formatCustomerNumber(order.user_id ?? user.id)}`, 350, 120, { align: 'right', width: 195 })
         .text(`Échéance : paiement sous ${dueDays} jours`,         350, 134, { align: 'right', width: 195 });

      doc.moveTo(PAGE_MARGIN, 152).lineTo(545, 152).strokeColor(border).lineWidth(1).stroke();

      // ── Adresse de facturation complète ─────────────────────────
      const billFirst  = order.billing_first_name ?? order.shipping_first_name ?? user.first_name;
      const billLast   = order.billing_last_name  ?? order.shipping_last_name  ?? user.last_name;
      const billStreet = order.billing_street ?? order.shipping_street;
      const billNumber = order.billing_street_number ?? order.shipping_street_number;
      const billZip    = order.billing_zip ?? order.shipping_zip;
      const billCity   = order.billing_city ?? order.shipping_city;

      doc.fontSize(8).fillColor(muted).font('Helvetica-Bold')
         .text('FACTURÉ À', PAGE_MARGIN, 168, { characterSpacing: 0.5 });

      doc.fontSize(10).fillColor(dark).font('Helvetica-Bold')
         .text(`${billFirst ?? ''} ${billLast ?? ''}`.trim() || 'Client', PAGE_MARGIN, 182);

      let addrY = 197;
      doc.fontSize(9.5).fillColor(dark).font('Helvetica');
      if (billStreet) {
        doc.text(`${billStreet}${billNumber ? ' ' + billNumber : ''}`, PAGE_MARGIN, addrY);
        addrY += 13;
      }
      if (billZip || billCity) {
        doc.text(`${billZip ?? ''} ${billCity ?? ''}`.trim(), PAGE_MARGIN, addrY);
        addrY += 13;
      }
      doc.fillColor(muted).text(user.email, PAGE_MARGIN, addrY);

      // ── Tableau des articles — en-tête réutilisable pour la pagination ──
      const drawTableHeader = (top) => {
        doc.rect(PAGE_MARGIN, top - 4, CONTENT_W, 20).fillColor('#f9fafb').fill();
        doc.fontSize(8).fillColor(muted).font('Helvetica-Bold')
           .text('PRODUIT',     TABLE_COLS.name,  top + 2, { width: TABLE_COLS.nameW })
           .text('QTÉ',         TABLE_COLS.qty,   top + 2, { width: TABLE_COLS.qtyW,   align: 'center' })
           .text('PRIX UNIT.',  TABLE_COLS.price, top + 2, { width: TABLE_COLS.priceW, align: 'right' })
           .text('TVA',         TABLE_COLS.vat,   top + 2, { width: TABLE_COLS.vatW,   align: 'right' })
           .text('TOTAL TTC',   TABLE_COLS.total, top + 2, { width: TABLE_COLS.totalW, align: 'right' });
        return top + 24;
      };

      /* Départ du tableau calé sous le bloc d'adresse, dont la hauteur varie
         selon les lignes réellement présentes (rue, NPA/localité, email). */
      let y = drawTableHeader(Math.max(244, addrY + 26));
      const items = order.items || [];

      // Lignes de totaux au-delà du minimum (une ligne de TVA, pas de remise) —
      // sert à réserver assez de place au-dessus du bulletin QR (une ligne = 18pt).
      const vat         = computeTaxBreakdown(order);
      const discount    = order.discount ? roundCHF(parseFloat(order.discount)) : 0;
      const extraTotals = Math.max(1, vat.parts.length) - 1 + (discount > 0 ? 1 : 0);

      items.forEach((item, idx) => {
        const snapshot = typeof item.product_snapshot_json === 'string'
          ? JSON.parse(item.product_snapshot_json)
          : (item.product_snapshot_json || {});

        const name      = snapshot.name || `Produit #${item.product_id}`;
        const sku       = snapshot.sku  || '';
        const unitPrice = roundCHF(parseFloat(item.unit_price));
        const lineTotal = roundCHF(unitPrice * item.quantity);
        const lineRate  = parseFloat(item.tax_rate_snapshot) > 0 ? parseFloat(item.tax_rate_snapshot) : 8.1;
        const rowHeight = sku ? 26 : 22;

        // Saut de page si la ligne dépasserait la zone réservée au bulletin QR
        // (uniquement sur la dernière page — les pages intermédiaires vont jusqu'au bas)
        const isLastItem = idx === items.length - 1;
        // +18pt par ligne de totaux au-delà du minimum (remise, taux supplémentaire)
        const reserved = isLastItem ? QR_BILL_HEIGHT + 90 + extraTotals * 18 : 40;
        if (y + rowHeight > PAGE_BOTTOM - reserved) {
          doc.addPage();
          y = drawTableHeader(PAGE_MARGIN);
        }

        if (idx % 2 === 0) {
          doc.rect(PAGE_MARGIN, y - 2, CONTENT_W, rowHeight).fillColor(rowAlt).fill();
        }

        doc.fontSize(9).fillColor(dark).font('Helvetica-Bold')
           .text(name, TABLE_COLS.name, y, { width: TABLE_COLS.nameW, height: 11, ellipsis: true });

        if (sku) {
          doc.fontSize(7.5).fillColor(muted).font('Helvetica')
             .text(`Réf. ${sku}`, TABLE_COLS.name, y + 11, { width: TABLE_COLS.nameW });
        }

        doc.fontSize(9).fillColor(dark).font('Helvetica')
           .text(String(item.quantity),         TABLE_COLS.qty,   y, { width: TABLE_COLS.qtyW,   align: 'center' })
           .text(`CHF ${unitPrice.toFixed(2)}`, TABLE_COLS.price, y, { width: TABLE_COLS.priceW, align: 'right' })
           .text(`${formatRate(lineRate)} %`,   TABLE_COLS.vat,   y, { width: TABLE_COLS.vatW,   align: 'right' })
           .text(`CHF ${lineTotal.toFixed(2)}`, TABLE_COLS.total, y, { width: TABLE_COLS.totalW, align: 'right' });

        y += rowHeight;
      });

      doc.moveTo(PAGE_MARGIN, y + 4).lineTo(545, y + 4).strokeColor(border).lineWidth(0.5).stroke();

      // ── Totaux ────────────────────────────────────────────────
      const totalsLeft  = 330;
      const totalsWidth = 215;
      let ty = y + 16;

      const subtotal = roundCHF(parseFloat(order.subtotal)); // articles, remise déduite
      const shipping = roundCHF(parseFloat(order.shipping_cost));
      const total    = roundCHF(parseFloat(order.total));

      const rowTotals = (label, value) => {
        doc.fontSize(9).font('Helvetica').fillColor(muted)
           .text(label, totalsLeft, ty, { width: 140 })
           .text(value, totalsLeft + 140, ty, { width: 75, align: 'right' });
        ty += 18;
      };

      /* Montant des articles AVANT remise : c'est la somme des lignes du tableau.
         La remise vient en ligne distincte — sans elle, le sous-total imprimé
         (déjà remisé) ne correspondait plus à l'addition des lignes. */
      rowTotals('Articles TTC', `CHF ${roundCHF(subtotal + discount).toFixed(2)}`);
      if (discount > 0) {
        rowTotals(
          order.coupon_code ? `Remise (${order.coupon_code})` : 'Remise',
          `- CHF ${discount.toFixed(2)}`
        );
      }

      // Le port porte la TVA des articles livrés — un seul taux en pratique
      const shippingRates = vat.parts.filter((p) => p.shippingTTC > 0);
      const shippingLabel = shippingRates.length === 1
        ? `Frais de livraison (TVA ${formatRate(shippingRates[0].ratePercent)} %)`
        : 'Frais de livraison';
      rowTotals(shippingLabel, `CHF ${shipping.toFixed(2)}`);

      /* Détail hors taxe / TVA / TTC (ADM-14).
         Les prix affichés en boutique sont TTC — obligation suisse envers le
         consommateur — donc la TVA y est déjà comprise et se retranche du total
         pour obtenir le montant hors taxe (LTVA art. 26). Frais de port compris :
         ils étaient auparavant laissés hors TVA. */
      const totalHT = vat.parts.reduce((sum, p) => sum + p.baseHT, 0);
      rowTotals('Sous-total HT', `CHF ${totalHT.toFixed(2)}`);

      // TVA détaillée par taux, au centime, avec sa base hors taxe (LTVA art. 26)
      for (const part of vat.parts) {
        rowTotals(
          `TVA ${formatRate(part.ratePercent)} % sur CHF ${part.baseHT.toFixed(2)}`,
          `CHF ${part.tvaAmount.toFixed(2)}`
        );
      }

      doc.rect(totalsLeft, ty - 2, totalsWidth, 26).fillColor(roseLight).fill();
      doc.fontSize(11).font('Helvetica-Bold').fillColor(rose)
         .text('TOTAL TTC',               totalsLeft + 8,   ty + 5, { width: 120 })
         .text(`CHF ${total.toFixed(2)}`, totalsLeft + 120, ty + 5, { width: 87, align: 'right' });

      // ── Note de paiement ──────────────────────────────────────
      const noteY = ty + 46;
      doc.fontSize(9).fillColor(dark).font('Helvetica')
         .text(
           `Réglez cette facture en scannant le QR code ci-dessous avec votre application bancaire, sous ${dueDays} jours.`,
           PAGE_MARGIN, noteY, { width: CONTENT_W }
         );

      // ── QR-facture suisse — attachée en bas de la dernière page ──
      // `language: 'FR'` est indispensable : la librairie rend le bulletin en
      // ALLEMAND par défaut (Zahlteil, Empfangsschein, Betrag…), alors que le
      // reste de la facture est en français.
      const qrBill = new SwissQRBill(buildQrBillData(order, issuer), { language: 'FR' });
      qrBill.attachTo(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// ─────────────────────────────────────────────────────────────
// Envoie l'email « facture QR » avec le PDF en pièce jointe
// ─────────────────────────────────────────────────────────────
/* Coordonnées d'émetteur, n° TVA et délai saisis dans l'admin (Paramètres →
   Facturation), avec repli sur la configuration serveur si la lecture échoue.
   require() local : shopSettings tire la couche base de données. */
const loadIssuerSettings = async () => {
  try {
    const { getInvoiceSettings } = require('./shopSettings.service');
    return await getInvoiceSettings();
  } catch (err) {
    console.error('[Facture] Réglages de facturation illisibles, configuration serveur utilisée :', err.message);
    return null;
  }
};

/* L'e-mail de facture plantait À CHAQUE commande par facture depuis le 16/09
   (« issuer is not defined » : variable propre à generateInvoicePDF, inconnue
   ici) — les clientes ne recevaient jamais leur QR-facture. Il ignorait aussi
   les réglages de l'admin : le n° TVA saisi par la boutique n'y figurait pas
   (ADM-13). La facture téléchargée depuis l'admin, elle, les appliquait. */
const sendInvoiceEmail = async ({ user, order }) => {
  const settings  = await loadIssuerSettings();
  const pdfBuffer = await generateInvoicePDF({ order, user, settings });
  const dueDate   = computeDueDate(settings?.dueDays ?? env.invoiceDueDays);
  await emailService.sendInvoice({ user, order, pdfBuffer, dueDate });
};

// ─────────────────────────────────────────────────────────────
// Récupère le PDF d'une commande pour téléchargement (endpoint client)
// ─────────────────────────────────────────────────────────────
// Même facture que celle envoyée par e-mail et téléchargée depuis l'admin
const getInvoicePdf = async ({ order, user }) => {
  if (!order) throw new AppError('Commande introuvable.', 404);
  const settings = await loadIssuerSettings();
  return generateInvoicePDF({ order, user, settings });
};

module.exports = {
  generateInvoicePDF,
  generateQrReference,
  computeDueDate,
  computeTaxBreakdown,
  sendInvoiceEmail,
  getInvoicePdf,
};
