const path             = require('path');
const PDFDocument     = require('pdfkit');
const { SwissQRBill } = require('swissqrbill/pdf');
const { roundCHF }    = require('../utils/chf.utils');
const env             = require('../config/env');
const emailService    = require('./email.service');
const { AppError }    = require('../middlewares/errorHandler');

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

// ─────────────────────────────────────────────────────────────
// Référence de paiement interne — figée sur la commande facture QR
// Sert au rapprochement manuel du paiement reçu (l'admin marque « payé »)
// Format : APC + horodatage base36 + suffixe aléatoire (max 27 caractères)
// ─────────────────────────────────────────────────────────────
const generateQrReference = () => {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1e6).toString(36).toUpperCase().padStart(4, '0');
  return `APC${ts}${rand}`;
};

// Date d'échéance de la facture (aujourd'hui + délai configuré, défaut 30 jours)
const computeDueDate = () => {
  const due = new Date();
  due.setDate(due.getDate() + (env.invoiceDueDays || 30));
  return due;
};

const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Construit l'objet de données attendu par SwissQRBill à partir d'une commande
const buildQrBillData = (order) => {
  const dueDays = env.invoiceDueDays || 30;
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
      account: env.qrInvoiceIban,
      name:    env.qrInvoiceName,
      address: env.qrInvoiceAddress,
      city:    env.qrInvoiceCity,
      zip:     parseInt(env.qrInvoiceZip, 10) || env.qrInvoiceZip,
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
    // Message libre : référence interne pour le rapprochement (IBAN normal → pas de référence structurée)
    message: order.qr_reference
      ? `Commande #${order.id} — ${order.qr_reference} — payable sous ${dueDays} jours`
      : `Commande #${order.id} — payable sous ${dueDays} jours`,
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
const TABLE_COLS   = { name: 55, nameW: 230, qty: 290, qtyW: 50, price: 345, priceW: 90, total: 440, totalW: 105 };
// Hauteur réservée en bas de la dernière page pour le bulletin QR suisse (bulletin
// officiel ≈ 105mm ≈ 297pt) — le tableau ne doit jamais empiéter dessus.
const QR_BILL_HEIGHT = 300;
const PAGE_BOTTOM    = 792 - PAGE_MARGIN; // A4 = 842pt de haut, marge basse identique à la marge haute

// ─────────────────────────────────────────────────────────────
// Génère un PDF de facture (Buffer) : facture détaillée + QR-facture suisse
// Signature conservée { order, user } — utilisée par l'admin et le flux client
// ─────────────────────────────────────────────────────────────
const generateInvoicePDF = ({ order, user }) => {
  return new Promise((resolve, reject) => {
    try {
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

      doc.fontSize(9).fillColor(muted).font('Helvetica')
         .text(`${env.qrInvoiceAddress} · ${env.qrInvoiceZip} ${env.qrInvoiceCity}`, PAGE_MARGIN, 96);

      doc.fontSize(24).fillColor(dark).font('Helvetica-Bold')
         .text('FACTURE', 350, 46, { align: 'right', width: 195 });

      doc.fontSize(9).fillColor(muted).font('Helvetica')
         .text(`N° ${String(order.id).padStart(6, '0')}`,           350, 78,  { align: 'right', width: 195 })
         .text(`Date : ${formatDate(order.created_at)}`,            350, 92,  { align: 'right', width: 195 })
         .text(`Échéance : paiement sous ${dueDays} jours`,         350, 106, { align: 'right', width: 195 });

      doc.moveTo(PAGE_MARGIN, 128).lineTo(545, 128).strokeColor(border).lineWidth(1).stroke();

      // ── Adresse de facturation complète ─────────────────────────
      const billFirst  = order.billing_first_name ?? order.shipping_first_name ?? user.first_name;
      const billLast   = order.billing_last_name  ?? order.shipping_last_name  ?? user.last_name;
      const billStreet = order.billing_street ?? order.shipping_street;
      const billNumber = order.billing_street_number ?? order.shipping_street_number;
      const billZip    = order.billing_zip ?? order.shipping_zip;
      const billCity   = order.billing_city ?? order.shipping_city;

      doc.fontSize(8).fillColor(muted).font('Helvetica-Bold')
         .text('FACTURÉ À', PAGE_MARGIN, 144, { characterSpacing: 0.5 });

      doc.fontSize(10).fillColor(dark).font('Helvetica-Bold')
         .text(`${billFirst ?? ''} ${billLast ?? ''}`.trim() || 'Client', PAGE_MARGIN, 158);

      let addrY = 173;
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
           .text('TOTAL',       TABLE_COLS.total, top + 2, { width: TABLE_COLS.totalW, align: 'right' });
        return top + 24;
      };

      let y = drawTableHeader(220);
      const items = order.items || [];

      items.forEach((item, idx) => {
        const snapshot = typeof item.product_snapshot_json === 'string'
          ? JSON.parse(item.product_snapshot_json)
          : (item.product_snapshot_json || {});

        const name      = snapshot.name || `Produit #${item.product_id}`;
        const sku       = snapshot.sku  || '';
        const unitPrice = roundCHF(parseFloat(item.unit_price));
        const lineTotal = roundCHF(unitPrice * item.quantity);
        const rowHeight = sku ? 26 : 22;

        // Saut de page si la ligne dépasserait la zone réservée au bulletin QR
        // (uniquement sur la dernière page — les pages intermédiaires vont jusqu'au bas)
        const isLastItem = idx === items.length - 1;
        const reserved = isLastItem ? QR_BILL_HEIGHT + 90 : 40;
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
           .text(`CHF ${lineTotal.toFixed(2)}`, TABLE_COLS.total, y, { width: TABLE_COLS.totalW, align: 'right' });

        y += rowHeight;
      });

      doc.moveTo(PAGE_MARGIN, y + 4).lineTo(545, y + 4).strokeColor(border).lineWidth(0.5).stroke();

      // ── Totaux ────────────────────────────────────────────────
      const totalsLeft  = 330;
      const totalsWidth = 215;
      let ty = y + 16;

      const subtotal  = roundCHF(parseFloat(order.subtotal));
      const shipping  = roundCHF(parseFloat(order.shipping_cost));
      const taxAmount = roundCHF(parseFloat(order.tax_amount));
      const total     = roundCHF(parseFloat(order.total));

      const rowTotals = (label, value) => {
        doc.fontSize(9).font('Helvetica').fillColor(muted)
           .text(label, totalsLeft, ty, { width: 120 })
           .text(value, totalsLeft + 120, ty, { width: 95, align: 'right' });
        ty += 18;
      };

      rowTotals('Sous-total', `CHF ${subtotal.toFixed(2)}`);
      rowTotals('Frais de livraison', `CHF ${shipping.toFixed(2)}`);
      const blendedRate = subtotal > 0 ? ((taxAmount / subtotal) * 100).toFixed(1) : '8.1';
      rowTotals(`TVA incluse (${blendedRate}%)`, `CHF ${taxAmount.toFixed(2)}`);

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
      const qrBill = new SwissQRBill(buildQrBillData(order));
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
const sendInvoiceEmail = async ({ user, order }) => {
  const pdfBuffer = await generateInvoicePDF({ order, user });
  const dueDate   = computeDueDate();
  await emailService.sendInvoice({ user, order, pdfBuffer, dueDate });
};

// ─────────────────────────────────────────────────────────────
// Récupère le PDF d'une commande pour téléchargement (endpoint client)
// ─────────────────────────────────────────────────────────────
const getInvoicePdf = async ({ order, user }) => {
  if (!order) throw new AppError('Commande introuvable.', 404);
  return generateInvoicePDF({ order, user });
};

module.exports = {
  generateInvoicePDF,
  generateQrReference,
  computeDueDate,
  sendInvoiceEmail,
  getInvoicePdf,
};
