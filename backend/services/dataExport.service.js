const PDFDocument  = require('pdfkit');
const path          = require('path');
const { roundCHF }  = require('../utils/chf.utils');

const LOGO_PATH   = path.join(__dirname, '../assets/logo.png');
const PAGE_MARGIN = 50;
const CONTENT_W   = 495; // A4 (595pt) - 2×50 de marge

const COLORS = {
  rose:   '#be185d',
  dark:   '#1a0a1e',
  muted:  '#6b7280',
  border: '#e5e7eb',
  rowAlt: '#faf9fb',
};

const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────────────────────────────────────────────
// Génère le PDF d'export des données personnelles (LPD art. 25)
// Signature : { data } — objet retourné par userService.exportUserData
// ─────────────────────────────────────────────────────────────
const generateDataExportPDF = ({ data }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end',  ()      => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { rose, dark, muted, border, rowAlt } = COLORS;

      // ── En-tête ──────────────────────────────────────────────
      doc.image(LOGO_PATH, PAGE_MARGIN, 44, { height: 40 });
      doc.fontSize(18).fillColor(dark).font('Helvetica-Bold')
         .text('Export de mes données personnelles', 200, 48, { align: 'right', width: 345 });
      doc.fontSize(8).fillColor(muted).font('Helvetica')
         .text(`Généré le ${formatDateTime(data.export_metadata?.generated_at)}`, 200, 70, { align: 'right', width: 345 })
         .text('Base légale : LPD art. 25 (droit d\'accès)', 200, 82, { align: 'right', width: 345 });

      doc.moveTo(PAGE_MARGIN, 100).lineTo(545, 100).strokeColor(border).lineWidth(1).stroke();

      let y = 118;

      const sectionTitle = (label) => {
        if (y > 720) { doc.addPage(); y = PAGE_MARGIN; }
        doc.fontSize(13).fillColor(rose).font('Helvetica-Bold').text(label, PAGE_MARGIN, y);
        y += 20;
      };

      const fieldRow = (label, value) => {
        if (y > 760) { doc.addPage(); y = PAGE_MARGIN; }
        doc.fontSize(9).fillColor(muted).font('Helvetica').text(label, PAGE_MARGIN, y, { width: 160 });
        doc.fontSize(9).fillColor(dark).font('Helvetica-Bold').text(String(value ?? '—'), PAGE_MARGIN + 160, y, { width: CONTENT_W - 160 });
        y += 16;
      };

      const emptyNote = (label) => {
        doc.fontSize(9).fillColor(muted).font('Helvetica-Oblique').text(label, PAGE_MARGIN, y);
        y += 18;
      };

      // ── Profil ───────────────────────────────────────────────
      sectionTitle('Profil');
      const p = data.profile ?? {};
      fieldRow('Nom complet', `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
      fieldRow('Email', p.email);
      fieldRow('Langue', p.locale);
      fieldRow('Rôle', p.role);
      fieldRow('Email vérifié le', formatDateTime(p.email_verified_at));
      fieldRow('Compte créé le', formatDateTime(p.created_at));
      y += 10;

      // ── Adresses ─────────────────────────────────────────────
      sectionTitle('Adresses enregistrées');
      const addresses = data.addresses ?? [];
      if (addresses.length === 0) {
        emptyNote('Aucune adresse enregistrée.');
      } else {
        addresses.forEach((a, idx) => {
          if (y > 740) { doc.addPage(); y = PAGE_MARGIN; }
          if (idx % 2 === 0) doc.rect(PAGE_MARGIN, y - 2, CONTENT_W, 32).fillColor(rowAlt).fill();
          doc.fontSize(9).fillColor(dark).font('Helvetica-Bold')
             .text(a.label || `Adresse #${a.id}`, PAGE_MARGIN + 6, y);
          doc.fontSize(8.5).fillColor(muted).font('Helvetica')
             .text(`${a.street ?? ''} — ${a.zip ?? ''} ${a.city ?? ''}, ${a.country ?? ''}`, PAGE_MARGIN + 6, y + 13);
          y += 34;
        });
      }
      y += 6;

      // ── Commandes ────────────────────────────────────────────
      sectionTitle('Historique des commandes');
      const orders = data.orders ?? [];
      if (orders.length === 0) {
        emptyNote('Aucune commande.');
      } else {
        orders.forEach((o) => {
          if (y > 700) { doc.addPage(); y = PAGE_MARGIN; }
          doc.rect(PAGE_MARGIN, y - 2, CONTENT_W, 20).fillColor(rowAlt).fill();
          doc.fontSize(9).fillColor(dark).font('Helvetica-Bold')
             .text(`Commande #${o.id} — ${formatDate(o.created_at)}`, PAGE_MARGIN + 6, y + 2, { width: 300 });
          doc.fontSize(9).fillColor(rose).font('Helvetica-Bold')
             .text(`CHF ${roundCHF(parseFloat(o.total)).toFixed(2)}`, PAGE_MARGIN + 350, y + 2, { width: 139, align: 'right' });
          y += 20;
          doc.fontSize(8).fillColor(muted).font('Helvetica')
             .text(`Statut : ${o.status}`, PAGE_MARGIN + 6, y);
          y += 13;

          (o.items ?? []).forEach((item) => {
            if (y > 760) { doc.addPage(); y = PAGE_MARGIN; }
            const snap = typeof item.product_snapshot_json === 'string'
              ? JSON.parse(item.product_snapshot_json) : (item.product_snapshot_json || {});
            doc.fontSize(8).fillColor(dark).font('Helvetica')
               .text(`  • ${snap.name || `Produit #${item.product_id}`} × ${item.quantity}`, PAGE_MARGIN + 6, y, { width: CONTENT_W - 12 });
            y += 12;
          });
          y += 8;
        });
      }
      y += 6;

      // ── Avis ─────────────────────────────────────────────────
      sectionTitle('Avis publiés');
      const reviews = data.reviews ?? [];
      if (reviews.length === 0) {
        emptyNote('Aucun avis publié.');
      } else {
        reviews.forEach((r) => {
          if (y > 750) { doc.addPage(); y = PAGE_MARGIN; }
          doc.fontSize(8.5).fillColor(dark).font('Helvetica')
             .text(`★ ${r.rating}/5 — ${formatDate(r.created_at)}${r.title ? ` — ${r.title}` : ''}`, PAGE_MARGIN, y, { width: CONTENT_W });
          y += 14;
        });
      }
      y += 6;

      // ── Fidélité ─────────────────────────────────────────────
      sectionTitle('Programme de fidélité');
      const loyalty = data.loyalty ?? {};
      if (loyalty.account) {
        fieldRow('Total cumulé', `CHF ${roundCHF(parseFloat(loyalty.account.total_spend_chf ?? 0)).toFixed(2)}`);
      } else {
        emptyNote('Aucun compte fidélité.');
      }
      const rewards = loyalty.rewards ?? [];
      if (rewards.length > 0) {
        y += 4;
        doc.fontSize(8.5).fillColor(muted).font('Helvetica-Bold').text('Récompenses :', PAGE_MARGIN, y);
        y += 13;
        rewards.forEach((rw) => {
          if (y > 760) { doc.addPage(); y = PAGE_MARGIN; }
          doc.fontSize(8.5).fillColor(dark).font('Helvetica')
             .text(`  • ${rw.code} — ${rw.status}`, PAGE_MARGIN, y);
          y += 12;
        });
      }
      y += 10;

      // ── Liste de souhaits ────────────────────────────────────
      sectionTitle('Liste de souhaits');
      const wishlist = data.wishlist ?? [];
      if (wishlist.length === 0) {
        emptyNote('Aucun produit enregistré.');
      } else {
        wishlist.forEach((w) => {
          if (y > 760) { doc.addPage(); y = PAGE_MARGIN; }
          doc.fontSize(8.5).fillColor(dark).font('Helvetica').text(`  • ${w.product_name}`, PAGE_MARGIN, y);
          y += 12;
        });
      }
      y += 10;

      // ── Newsletter ───────────────────────────────────────────
      sectionTitle('Newsletter');
      fieldRow('Inscrit(e)', data.newsletter ? 'Oui' : 'Non');
      y += 6;

      // ── Journal de consentement ──────────────────────────────
      sectionTitle('Journal de consentement (LPD)');
      const consents = data.consent_logs ?? [];
      if (consents.length === 0) {
        emptyNote('Aucun consentement enregistré.');
      } else {
        consents.forEach((c) => {
          if (y > 760) { doc.addPage(); y = PAGE_MARGIN; }
          doc.fontSize(8.5).fillColor(dark).font('Helvetica')
             .text(`  • ${c.type} v${c.version} — accepté le ${formatDateTime(c.accepted_at)}`, PAGE_MARGIN, y);
          y += 12;
        });
      }

      // ── Mention de confidentialité — juste après le contenu de la dernière page ─
      y += 20;
      doc.fontSize(7).fillColor(muted).font('Helvetica')
         .text('Au Point-Compté — export personnel confidentiel', PAGE_MARGIN, y, { width: CONTENT_W, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateDataExportPDF };
