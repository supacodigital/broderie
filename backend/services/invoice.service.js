const path             = require('path');
const crypto           = require('crypto');
const PDFDocument     = require('pdfkit');
const { SwissQRBill } = require('swissqrbill/pdf');
const { isQRIBAN, calculateQRReferenceChecksum } = require('swissqrbill/utils');
const { roundCHF }    = require('../utils/chf.utils');
const { compareUnitPrice, salePercent } = require('../utils/sale.utils');
const lengthUtils     = require('../utils/length.utils');
const invoiceNumbering = require('../utils/invoiceNumber.utils');
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
   On encode ANNÉE (4) + MOIS (2) + compteur (6), complété par des zéros à
   gauche : la facture « 2026-09/01 » donne …0000 2026 09 000001 + clé (ADM-18).
   L'année et le mois sont indispensables : le compteur repart à 1 chaque mois,
   le seul numéro de séquence donnerait la même référence d'un mois à l'autre —
   la banque rapprocherait le paiement sur la mauvaise facture.
   Les factures annuelles d'avant ADM-18 (« 2026-000013 », `month` null) gardent
   leur référence ANNÉE (4) + compteur (6) : elles ne peuvent pas entrer en
   collision, leurs chiffres significatifs sont moins nombreux. */
const buildStructuredReference = (invoiceSeq, year = new Date().getFullYear(), month = null) => {
  const period  = month ? `${String(year)}${String(month).padStart(2, '0')}` : String(year);
  const numeric = `${period}${String(invoiceSeq).replace(/\D/g, '').padStart(6, '0')}`;
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
const generateQrReference = (invoiceSeq = null, year = new Date().getFullYear(), month = null) => (
  usesStructuredReference() && invoiceSeq
    ? buildStructuredReference(invoiceSeq, year, month)
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
  // Année et mois du numéro émis (mensuel ou annuel), sinon de la commande
  const parsed = invoiceNumbering.parseInvoiceNumber(order.invoice_number);
  const year = parsed?.year ?? new Date(order.created_at ?? Date.now()).getFullYear();
  const seq  = order.invoice_seq ?? parsed?.seq ?? order.id;
  return buildStructuredReference(seq || order.id, year, parsed?.month ?? null);
};

/* Dates à l'heure suisse : le serveur tourne en UTC, et une commande passée à
   00h30 à Vucherens aurait porté la date de la veille. */
const formatDate = (date) => new Date(date)
  .toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' });

/* Facture téléchargeable par la cliente : commande confirmée (numérotée), non
   annulée, et soit réglée par facture QR, soit déjà payée (Twint, carte, en
   boutique). Une commande « retrait, paiement en boutique » encore impayée n'a
   pas de facture : son bulletin QR inviterait à payer une seconde fois. */
const isInvoiceAvailableToCustomer = (order) => (
  !!order?.invoice_number
  && order.status !== 'cancelled'
  && (order.payment_method === 'invoice_qr' || !!order.paid_at)
);

const PAID_METHOD_LABELS = { twint: 'Twint', card: 'carte bancaire' };

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


/* Le bulletin QR suisse occupe les 105 derniers mm de la page A4 (842 pt) :
   swissqrbill le pose à 544 pt et ajoute une page si le contenu descend plus
   bas. Articles, totaux et note de la dernière page doivent donc s'arrêter
   au-dessus, avec une petite marge. */
const QR_BILL_TOP = 841.89 - 297.64;

/* Tableau des totaux : libellés alignés à gauche, montants alignés à droite
   sur la colonne « TOTAL TTC » des articles — une seule ligne d'alignement
   pour toute la facture. */
const TOTALS = { left: 300, labelW: 140, rowH: 20, totalH: 26, amountW: 72 };
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
    owner:     settings?.owner     ?? null,
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
      /* Délai saisi dans Paramètres → Facturation, comme l'échéance de l'e-mail :
         lu dans la seule configuration serveur, il pouvait contredire l'e-mail. */
      const dueDays = issuer.dueDays;

      /* Commande déjà payée (Twint, carte, en boutique…) : la facture est
         acquittée. Ni échéance ni bulletin QR — il invitait la cliente à payer
         une seconde fois. */
      const paidAt      = order.paid_at ? new Date(order.paid_at) : null;
      const paidBy      = PAID_METHOD_LABELS[order.paid_method] ?? null;
      // Bas utilisable de la dernière page : au-dessus du bulletin QR, s'il y en a un
      const lastPageBottom = paidAt ? PAGE_BOTTOM : QR_BILL_TOP - 12;

      // ── En-tête : logo + bloc FACTURE ──────────────────────────
      // Logo redimensionné à une hauteur fixe, ratio préservé (source 2720×1360)
      doc.image(LOGO_PATH, PAGE_MARGIN, 44, { height: 46 });

      /* Raison sociale en toutes lettres (ADM-13) — le logo est une image, il ne
         vaut pas mention de l'émetteur sur un document comptable. */
      doc.fontSize(10).fillColor(dark).font('Helvetica-Bold')
         .text(issuer.name, PAGE_MARGIN, 96);

      /* Titulaire de la raison individuelle (ADM-13) : nom de l'exploitante sous
         celui de la boutique, comme sur les factures de son ERP. Le bulletin QR
         garde le seul nom de la boutique, titulaire du compte bancaire. */
      let issuerY = 110;
      doc.fontSize(9).fillColor(muted).font('Helvetica');
      if (issuer.owner) {
        doc.text(issuer.owner, PAGE_MARGIN, issuerY);
        issuerY += 12;
      }
      doc.text(`${issuer.address} · ${issuer.zip} ${issuer.city}`, PAGE_MARGIN, issuerY);
      issuerY += 12;

      // N° TVA du vendeur — imprimé seulement si la boutique est assujettie (LTVA art. 26)
      if (issuer.vatNumber) {
        doc.text(`N° TVA : ${issuer.vatNumber}`, PAGE_MARGIN, issuerY);
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
         /* Le n° de facture est aussi le n° de commande (demande de la boutique,
            25.09) : la ligne « Commande n° 102 » en affichait un second, différent. */
         .text(`N° ${order.invoice_number ?? invoiceFallbackNumber(order)}`, 350, 78,  { align: 'right', width: 195 })
         // « Date de facture » et non « Date » : exigence comptable (ADM-15)
         .text(`Date de facture : ${formatDate(order.created_at)}`, 350, 92, { align: 'right', width: 195 })
         // Numéro de client — traçabilité comptable (ADM-17)
         .text(`N° client : ${formatCustomerNumber(order.user_id ?? user.id)}`, 350, 106, { align: 'right', width: 195 })
         .text(
           paidAt ? `Payée le : ${formatDate(paidAt)}` : `Échéance : paiement sous ${dueDays} jours`,
           350, 120, { align: 'right', width: 195 }
         );

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

      const vat      = computeTaxBreakdown(order);
      const discount = order.discount ? roundCHF(parseFloat(order.discount)) : 0;
      /* Hauteur du bloc totaux + note de paiement, à réserver au-dessus du
         bulletin QR : articles, remise éventuelle, port, sous-total HT, total. */
      const totalsRowCount    = 3 + (discount > 0 ? 1 : 0);
      const totalsBlockHeight = 16 + totalsRowCount * TOTALS.rowH + 8 + TOTALS.totalH + 40;

      items.forEach((item, idx) => {
        const snapshot = typeof item.product_snapshot_json === 'string'
          ? JSON.parse(item.product_snapshot_json)
          : (item.product_snapshot_json || {});

        const name      = snapshot.name || `Produit #${item.product_id}`;
        const sku       = snapshot.sku  || '';
        const unitPrice = roundCHF(parseFloat(item.unit_price));
        const lineTotal = roundCHF(unitPrice * item.quantity);
        const lineRate  = parseFloat(item.tax_rate_snapshot) > 0 ? parseFloat(item.tax_rate_snapshot) : 8.1;
        // Article en action (CLI-14) : prix normal barré et remise sous le prix payé
        const normalPrice = compareUnitPrice(snapshot, item);
        const onSale      = normalPrice !== null;
        const rowHeight   = sku || onSale ? 26 : 22;

        // Saut de page si la ligne dépasserait la zone réservée au bulletin QR
        // (uniquement sur la dernière page — les pages intermédiaires vont jusqu'au bas)
        const isLastItem = idx === items.length - 1;
        const pageLimit = isLastItem ? lastPageBottom - totalsBlockHeight : PAGE_BOTTOM - 40;
        if (y + rowHeight > pageLimit) {
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

        if (onSale) {
          // « En action » à la suite de la référence, et prix normal barré sous le prix payé
          doc.fontSize(7.5).font('Helvetica');
          const refWidth = sku ? doc.widthOfString(`Réf. ${sku}`) + 6 : 0;
          doc.fillColor(rose).font('Helvetica-Bold')
             .text(`En action -${salePercent(unitPrice, normalPrice)} %`, TABLE_COLS.name + refWidth, y + 11, { width: TABLE_COLS.nameW - refWidth });
          doc.fillColor(muted).font('Helvetica')
             .text(`CHF ${normalPrice.toFixed(2)}`, TABLE_COLS.price, y + 11, { width: TABLE_COLS.priceW, align: 'right', strike: true });
        }

        /* Article à la coupe : « 60 cm » et « CHF 1.80 / 10 cm » — la longueur
           vendue et le prix du tronçon réellement facturé, jamais « 6 × 1.80 ». */
        doc.fontSize(9).fillColor(dark).font('Helvetica')
           .text(lengthUtils.lineQuantityLabel(item), TABLE_COLS.qty, y, { width: TABLE_COLS.qtyW, align: 'center' })
           .text(`CHF ${unitPrice.toFixed(2)}${lengthUtils.lineUnitSuffix(item)}`, TABLE_COLS.price, y, { width: TABLE_COLS.priceW, align: 'right' })
           .text(`${formatRate(lineRate)} %`,   TABLE_COLS.vat,   y, { width: TABLE_COLS.vatW,   align: 'right' })
           .text(`CHF ${lineTotal.toFixed(2)}`, TABLE_COLS.total, y, { width: TABLE_COLS.totalW, align: 'right' });

        y += rowHeight;
      });

      doc.moveTo(PAGE_MARGIN, y + 4).lineTo(545, y + 4).strokeColor(border).lineWidth(0.5).stroke();

      // ── Totaux (tableau) ──────────────────────────────────────
      const totalsRight = TABLE_COLS.total + TABLE_COLS.totalW; // bord droit des montants des articles
      let ty = y + 16;

      const subtotal = roundCHF(parseFloat(order.subtotal)); // articles, remise déduite
      const shipping = roundCHF(parseFloat(order.shipping_cost));
      const total    = roundCHF(parseFloat(order.total));

      /* Montant du tableau : « CHF » calé sur une même verticale pour toutes les
         lignes, le nombre aligné à droite (décimales sous décimales). */
      const amountLeft = totalsRight - TOTALS.amountW;
      const drawAmount = (value, textY) => {
        doc.text('CHF', amountLeft, textY, { lineBreak: false });
        doc.text(value, amountLeft, textY, { width: TOTALS.amountW, align: 'right', lineBreak: false });
      };

      // Une ligne du tableau : libellé à gauche, montant sous la colonne TOTAL TTC, filet dessous
      const rowTotals = (label, value) => {
        doc.fontSize(9).font('Helvetica').fillColor(muted)
           .text(label, TOTALS.left, ty + 6, { width: TOTALS.labelW, lineBreak: false });
        doc.fillColor(dark);
        drawAmount(value, ty + 6);
        ty += TOTALS.rowH;
        doc.moveTo(TOTALS.left, ty).lineTo(totalsRight, ty).strokeColor(border).lineWidth(0.5).stroke();
      };

      /* Montant des articles AVANT remise : c'est la somme des lignes du tableau.
         La remise vient en ligne distincte — sans elle, le sous-total imprimé
         (déjà remisé) ne correspondait plus à l'addition des lignes. */
      rowTotals('Articles TTC', roundCHF(subtotal + discount).toFixed(2));
      if (discount > 0) {
        rowTotals(
          order.coupon_code ? `Remise (${order.coupon_code})` : 'Remise',
          `-${discount.toFixed(2)}`
        );
      }

      // Le port porte la TVA des articles livrés — un seul taux en pratique
      const shippingRates = vat.parts.filter((p) => p.shippingTTC > 0);
      const shippingLabel = shippingRates.length === 1
        ? `Frais de livraison (TVA ${formatRate(shippingRates[0].ratePercent)} %)`
        : 'Frais de livraison';
      rowTotals(shippingLabel, shipping.toFixed(2));

      /* Montant hors taxe (ADM-14) : les prix de la boutique sont TTC, la TVA
         se retranche du total (frais de port compris).
         La ligne « TVA x % sur CHF … » a été retirée après la réunion avec
         Christophe (25.09) : elle faisait doublon avec « Frais de livraison
         (TVA x %) ». Le taux reste lisible sur chaque article et sur le port. */
      const totalHT = vat.parts.reduce((sum, p) => sum + p.baseHT, 0);
      rowTotals('Sous-total HT', totalHT.toFixed(2));

      /* Total mis en valeur par un fond rose qui déborde légèrement du tableau :
         le texte garde exactement l'alignement des autres lignes. */
      ty += 8;
      doc.roundedRect(TOTALS.left - 8, ty, totalsRight - TOTALS.left + 16, TOTALS.totalH, 4).fillColor(roseLight).fill();
      doc.fontSize(11).font('Helvetica-Bold').fillColor(rose)
         .text('TOTAL TTC', TOTALS.left, ty + 8, { width: TOTALS.labelW, lineBreak: false });
      drawAmount(total.toFixed(2), ty + 8);
      ty += TOTALS.totalH;

      // ── Note de paiement ──────────────────────────────────────
      const noteY = ty + 20;
      doc.fontSize(9).fillColor(dark).font('Helvetica')
         .text(
           paidAt
             ? `Facture payée le ${formatDate(paidAt)}${paidBy ? ` par ${paidBy}` : ''}. Aucun montant à régler.`
             : `Réglez cette facture en scannant le QR code ci-dessous avec votre application bancaire, sous ${dueDays} jours.`,
           PAGE_MARGIN, noteY, { width: CONTENT_W }
         );

      // ── QR-facture suisse — attachée en bas de la dernière page ──
      // `language: 'FR'` est indispensable : la librairie rend le bulletin en
      // ALLEMAND par défaut (Zahlteil, Empfangsschein, Betrag…), alors que le
      // reste de la facture est en français.
      if (!paidAt) {
        const qrBill = new SwissQRBill(buildQrBillData(order, issuer), { language: 'FR' });
        qrBill.attachTo(doc);
      }

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
  isInvoiceAvailableToCustomer,
  generateInvoicePDF,
  generateQrReference,
  computeDueDate,
  computeTaxBreakdown,
  sendInvoiceEmail,
  getInvoicePdf,
};
