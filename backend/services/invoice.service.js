const PDFDocument     = require('pdfkit');
const { SwissQRBill } = require('swissqrbill/pdf');
const { roundCHF }    = require('../utils/chf.utils');
const env             = require('../config/env');
const emailService    = require('./email.service');
const { AppError }    = require('../middlewares/errorHandler');

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

// Découpe « rue + numéro » : isole le dernier groupe de chiffres comme numéro de bâtiment
const splitStreet = (street = '') => {
  const match = street.match(/^(.*?)\s*(\d+\w*)\s*$/);
  return {
    address:        match ? match[1].trim() : street,
    buildingNumber: match ? match[2] : undefined,
  };
};

// Construit l'objet de données attendu par SwissQRBill à partir d'une commande
const buildQrBillData = (order) => {
  const debtorStreet = splitStreet(order.street || '');
  const dueDays = env.invoiceDueDays || 30;
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
      name:           `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim() || 'Client',
      address:        debtorStreet.address || 'Adresse',
      buildingNumber: debtorStreet.buildingNumber,
      city:           order.city || '',
      zip:            parseInt(order.zip, 10) || order.zip || 0,
      country:        'CH',
    },
    // Message libre : référence interne pour le rapprochement (IBAN normal → pas de référence structurée)
    message: order.qr_reference
      ? `Commande #${order.id} — ${order.qr_reference} — payable sous ${dueDays} jours`
      : `Commande #${order.id} — payable sous ${dueDays} jours`,
  };
};

// ─────────────────────────────────────────────────────────────
// Génère un PDF de facture (Buffer) : facture détaillée + QR-facture suisse
// Signature conservée { order, user } — utilisée par l'admin et le flux client
// ─────────────────────────────────────────────────────────────
const generateInvoicePDF = ({ order, user }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end',  ()      => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const rose  = '#be185d';
      const dark  = '#1a0a1e';
      const muted = '#6b7280';
      const W = 495; // largeur utile (595 - 2×50)

      const dueDays = env.invoiceDueDays || 30;

      // ── En-tête ──────────────────────────────────────────────
      doc.fontSize(22).fillColor(rose).font('Helvetica-Bold')
         .text(env.qrInvoiceName, 50, 50);

      doc.fontSize(9).fillColor(muted).font('Helvetica')
         .text(`${env.qrInvoiceAddress} · ${env.qrInvoiceZip} ${env.qrInvoiceCity}`, 50, 76);

      // Bloc FACTURE (aligné à droite)
      doc.fontSize(26).fillColor(dark).font('Helvetica-Bold')
         .text('FACTURE', 350, 50, { align: 'right', width: 195 });

      doc.fontSize(9).fillColor(muted).font('Helvetica')
         .text(`N° ${String(order.id).padStart(6, '0')}`, 350, 82, { align: 'right', width: 195 })
         .text(`Date : ${formatDate(order.created_at)}`,   350, 96, { align: 'right', width: 195 })
         .text(`Échéance : paiement sous ${dueDays} jours`, 350, 110, { align: 'right', width: 195 });

      // Ligne de séparation
      doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').lineWidth(1).stroke();

      // ── Adresse client ────────────────────────────────────────
      doc.fontSize(9).fillColor(muted).font('Helvetica')
         .text('Facturé à :', 50, 145);

      doc.fontSize(10).fillColor(dark).font('Helvetica-Bold')
         .text(`${user.first_name} ${user.last_name}`, 50, 160);

      doc.fontSize(10).fillColor(dark).font('Helvetica')
         .text(user.email, 50, 175);

      // ── Tableau des articles ──────────────────────────────────
      const tableTop = 220;

      doc.fontSize(8).fillColor(muted).font('Helvetica-Bold');
      doc.rect(50, tableTop - 4, W, 20).fillColor('#f9fafb').fill();
      doc.fillColor(muted)
         .text('PRODUIT',     55, tableTop + 2, { width: 230 })
         .text('QTÉ',        290, tableTop + 2, { width: 50,  align: 'center' })
         .text('PRIX UNIT.', 345, tableTop + 2, { width: 90,  align: 'right' })
         .text('TOTAL',      440, tableTop + 2, { width: 105, align: 'right' });

      let y = tableTop + 24;
      const items = order.items || [];

      items.forEach((item, idx) => {
        const snapshot = typeof item.product_snapshot_json === 'string'
          ? JSON.parse(item.product_snapshot_json)
          : (item.product_snapshot_json || {});

        const name      = snapshot.name || `Produit #${item.product_id}`;
        const sku       = snapshot.sku  || '';
        const unitPrice = roundCHF(parseFloat(item.unit_price));
        const lineTotal = roundCHF(unitPrice * item.quantity);

        if (idx % 2 === 0) {
          doc.rect(50, y - 2, W, 22).fillColor('#fff').fill();
        }

        doc.fontSize(9).fillColor(dark).font('Helvetica-Bold')
           .text(name, 55, y, { width: 230, ellipsis: true });

        if (sku) {
          doc.fontSize(7.5).fillColor(muted).font('Helvetica')
             .text(`Réf. ${sku}`, 55, y + 11, { width: 230 });
        }

        doc.fontSize(9).fillColor(dark).font('Helvetica')
           .text(String(item.quantity),         290, y, { width: 50,  align: 'center' })
           .text(`CHF ${unitPrice.toFixed(2)}`, 345, y, { width: 90,  align: 'right' })
           .text(`CHF ${lineTotal.toFixed(2)}`, 440, y, { width: 105, align: 'right' });

        y += sku ? 26 : 22;
      });

      doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

      // ── Totaux ────────────────────────────────────────────────
      const totalsLeft = 330;
      const totalsWidth = 215;
      let ty = y + 16;

      const subtotal  = roundCHF(parseFloat(order.subtotal));
      const shipping  = roundCHF(parseFloat(order.shipping_cost));
      const taxAmount = roundCHF(parseFloat(order.tax_amount));
      const total     = roundCHF(parseFloat(order.total));

      const rowTotals = (label, value, isBold = false) => {
        doc.fontSize(9)
           .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
           .fillColor(isBold ? dark : muted)
           .text(label, totalsLeft, ty, { width: 120 })
           .text(value, totalsLeft + 120, ty, { width: 95, align: 'right' });
        ty += 18;
      };

      rowTotals('Sous-total', `CHF ${subtotal.toFixed(2)}`);
      rowTotals('Frais de livraison', `CHF ${shipping.toFixed(2)}`);
      const blendedRate = subtotal > 0 ? ((taxAmount / subtotal) * 100).toFixed(1) : '8.1';
      rowTotals(`TVA incluse (${blendedRate}%)`, `CHF ${taxAmount.toFixed(2)}`);

      doc.rect(totalsLeft, ty - 2, totalsWidth, 24).fillColor('#fdf2f8').fill();
      doc.fontSize(11).font('Helvetica-Bold').fillColor(rose)
         .text('TOTAL TTC',               totalsLeft + 4,   ty + 4, { width: 120 })
         .text(`CHF ${total.toFixed(2)}`, totalsLeft + 120, ty + 4, { width: 95, align: 'right' });

      // ── Note de paiement ──────────────────────────────────────
      const noteY = Math.max(ty + 40, y + 130);
      doc.fontSize(9).fillColor(dark).font('Helvetica')
         .text(
           `Réglez cette facture en scannant le QR code ci-dessous avec votre application bancaire, sous ${dueDays} jours.`,
           50, noteY, { width: W }
         );

      // ── QR-facture suisse — attachée en bas de page (ou page suivante si nécessaire) ──
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
