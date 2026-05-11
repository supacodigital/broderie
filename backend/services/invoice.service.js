const PDFDocument = require('pdfkit');
const { roundCHF } = require('../utils/chf.utils');

// Génère un PDF de facture et retourne un Buffer
const generateInvoicePDF = ({ order, user }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end',  ()      => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const rose = '#be185d';
    const dark = '#1a0a1e';
    const muted = '#6b7280';
    const W = 495; // largeur utile (595 - 2×50)

    // ── En-tête ──────────────────────────────────────────────
    doc.fontSize(22).fillColor(rose).font('Helvetica-Bold')
       .text('Au Point-Compté', 50, 50);

    doc.fontSize(9).fillColor(muted).font('Helvetica')
       .text('Lausanne, Suisse  ·  contact@aupointcompte.ch', 50, 76);

    // Bloc FACTURE (aligné à droite)
    doc.fontSize(26).fillColor(dark).font('Helvetica-Bold')
       .text('FACTURE', 350, 50, { align: 'right', width: 195 });

    doc.fontSize(9).fillColor(muted).font('Helvetica')
       .text(`N° ${String(order.id).padStart(6, '0')}`, 350, 82, { align: 'right', width: 195 })
       .text(`Date : ${formatDate(order.created_at)}`,   350, 96, { align: 'right', width: 195 })
       .text('Échéance : paiement sous 10 jours',        350, 110, { align: 'right', width: 195 });

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

    // En-têtes colonnes
    doc.fontSize(8).fillColor(muted).font('Helvetica-Bold');
    doc.rect(50, tableTop - 4, W, 20).fillColor('#f9fafb').fill();
    doc.fillColor(muted)
       .text('PRODUIT',     55, tableTop + 2, { width: 230 })
       .text('QTÉ',        290, tableTop + 2, { width: 50,  align: 'center' })
       .text('PRIX UNIT.', 345, tableTop + 2, { width: 90,  align: 'right' })
       .text('TOTAL',      440, tableTop + 2, { width: 105, align: 'right' });

    // Lignes articles
    let y = tableTop + 24;
    const items = order.items || [];

    items.forEach((item, idx) => {
      const snapshot = typeof item.product_snapshot_json === 'string'
        ? JSON.parse(item.product_snapshot_json)
        : (item.product_snapshot_json || {});

      const name     = snapshot.name || `Produit #${item.product_id}`;
      const sku      = snapshot.sku  || '';
      const unitPrice = roundCHF(parseFloat(item.unit_price));
      const lineTotal = roundCHF(unitPrice * item.quantity);

      // Fond alterné
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
         .text(String(item.quantity),            290, y, { width: 50,  align: 'center' })
         .text(`CHF ${unitPrice.toFixed(2)}`,    345, y, { width: 90,  align: 'right' })
         .text(`CHF ${lineTotal.toFixed(2)}`,    440, y, { width: 105, align: 'right' });

      y += sku ? 26 : 22;
    });

    // Ligne de séparation sous le tableau
    doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    // ── Totaux ────────────────────────────────────────────────
    const totalsLeft = 330;
    const totalsWidth = 215;
    let ty = y + 16;

    const subtotal    = roundCHF(parseFloat(order.subtotal));
    const shipping    = roundCHF(parseFloat(order.shipping_cost));
    const taxAmount   = roundCHF(parseFloat(order.tax_amount));
    const total       = roundCHF(parseFloat(order.total));

    doc.fontSize(9).fillColor(muted).font('Helvetica');

    const rowTotals = (label, value, isBold = false) => {
      doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(isBold ? dark : muted)
         .text(label, totalsLeft, ty, { width: 120 })
         .text(value, totalsLeft + 120, ty, { width: 95, align: 'right' });
      ty += 18;
    };

    rowTotals('Sous-total HT estimé', `CHF ${(subtotal - taxAmount + shipping > 0 ? subtotal - taxAmount : 0).toFixed(2)}`);
    rowTotals('Frais de livraison',   `CHF ${shipping.toFixed(2)}`);
    const blendedRate = subtotal > 0 ? ((taxAmount / subtotal) * 100).toFixed(1) : '8.1';
    rowTotals(`TVA incluse (${blendedRate}%)`,   `CHF ${taxAmount.toFixed(2)}`);

    // Ligne total
    doc.rect(totalsLeft, ty - 2, totalsWidth, 24).fillColor('#fdf2f8').fill();
    doc.fontSize(11).font('Helvetica-Bold').fillColor(rose)
       .text('TOTAL TTC',        totalsLeft + 4,     ty + 4, { width: 120 })
       .text(`CHF ${total.toFixed(2)}`, totalsLeft + 120, ty + 4, { width: 95, align: 'right' });

    ty += 32;

    // ── Instructions de paiement ──────────────────────────────
    ty = Math.max(ty, y + 130);

    doc.rect(50, ty, W, 72).fillColor('#fdf2f8').fill();
    doc.fontSize(9).fillColor(rose).font('Helvetica-Bold')
       .text('INSTRUCTIONS DE PAIEMENT', 60, ty + 10);

    doc.fontSize(8.5).fillColor(dark).font('Helvetica')
       .text('Veuillez effectuer le virement dans les 10 jours suivant la réception de cette facture.', 60, ty + 24, { width: W - 20 })
       .text('Référence à indiquer : FAC-' + String(order.id).padStart(6, '0'), 60, ty + 38)
       .text(`IBAN : ${process.env.STORE_IBAN || 'À COMPLÉTER'}  ·  Au Point-Compté, Lausanne`, 60, ty + 52);

    // ── Pied de page ──────────────────────────────────────────
    doc.fontSize(8).fillColor(muted).font('Helvetica')
       .text(
         'Au Point-Compté · Lausanne, Suisse · TVA CHE-XXX.XXX.XXX · contact@aupointcompte.ch',
         50, 760, { align: 'center', width: W }
       );

    doc.end();
  });
};

const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

module.exports = { generateInvoicePDF };
