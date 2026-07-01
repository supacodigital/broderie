const transporter = require('../config/mailer');
const { roundCHF } = require('../utils/chf.utils');
const env = require('../config/env');

const FROM     = env.mailFrom    || '"Au Point-Compté" <noreply@broderie-domaine.ch>';
const BASE_URL = env.clientUrl   || 'https://broderie-domaine.ch';

// ─────────────────────────────────────────────
// Helpers communs
// ─────────────────────────────────────────────

// Échappe les caractères HTML — obligatoire avant toute interpolation de données utilisateur dans un template email
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Mise en page HTML commune à tous les emails
function layout(content, locale = 'fr') {
  const footerText = {
    fr: `Vous recevez cet email car vous avez un compte sur Au Point-Compté.<br>
         <a href="${BASE_URL}/cgv" style="color:#DB2777;">CGV</a> &nbsp;·&nbsp;
         <a href="${BASE_URL}/mon-compte" style="color:#DB2777;">Mon compte</a> &nbsp;·&nbsp;
         <a href="mailto:contact@broderie-domaine.ch" style="color:#DB2777;">Contact</a>`,
    de: `Sie erhalten diese E-Mail, weil Sie ein Konto bei Au Point-Compté haben.<br>
         <a href="${BASE_URL}/cgv" style="color:#DB2777;">AGB</a> &nbsp;·&nbsp;
         <a href="${BASE_URL}/mon-compte" style="color:#DB2777;">Mein Konto</a> &nbsp;·&nbsp;
         <a href="mailto:contact@broderie-domaine.ch" style="color:#DB2777;">Kontakt</a>`,
    en: `You received this email because you have an account on Au Point-Compté.<br>
         <a href="${BASE_URL}/cgv" style="color:#DB2777;">T&C</a> &nbsp;·&nbsp;
         <a href="${BASE_URL}/mon-compte" style="color:#DB2777;">My account</a> &nbsp;·&nbsp;
         <a href="mailto:contact@broderie-domaine.ch" style="color:#DB2777;">Contact</a>`,
  };

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Au Point-Compté</title>
</head>
<body style="margin:0;padding:0;background:#f9f0f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f0f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(219,39,119,0.08);">

        <!-- En-tête -->
        <tr>
          <td style="background:linear-gradient(135deg,#DB2777,#be185d);padding:32px 40px;text-align:center;">
            <p style="margin:0;font-family:Georgia,serif;font-size:26px;font-style:italic;font-weight:700;color:#fff;letter-spacing:.01em;">
              Au Point-Compté
            </p>
            <p style="margin:6px 0 0;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.7);">
              Broderie &amp; Arts de l'aiguille — Suisse 🇨🇭
            </p>
          </td>
        </tr>

        <!-- Contenu -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${content}
          </td>
        </tr>

        <!-- Pied de page -->
        <tr>
          <td style="background:#fdf2f8;border-top:1px solid #fbcfe8;padding:20px 40px;text-align:center;font-size:11px;color:#9D6480;line-height:1.7;">
            ${footerText[locale] ?? footerText.fr}<br><br>
            © ${new Date().getFullYear()} Au Point-Compté — Lausanne, Suisse
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Bouton CTA
function btn(url, label, color = '#DB2777') {
  return `<a href="${url}"
    style="display:inline-block;margin-top:24px;padding:14px 32px;background:${color};color:#fff;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:.02em;">
    ${label}
  </a>`;
}

// Libellé « sur commande » par locale — affiché sous les produits fabriqués à la demande
const MADE_TO_ORDER_LABEL = {
  fr: 'Sur commande — 3 à 4 semaines',
  de: 'Auf Bestellung — 3 bis 4 Wochen',
  en: 'Made to order — 3 to 4 weeks',
};

// Ligne de récapitulatif commande
function orderItemRow(item, locale = 'fr') {
  const snap   = typeof item.product_snapshot_json === 'string'
    ? JSON.parse(item.product_snapshot_json)
    : (item.product_snapshot_json ?? {});
  const name   = escapeHtml(snap.name ?? `Produit #${item.product_id}`);
  const price  = roundCHF(parseFloat(item.unit_price) * item.quantity);
  // Mention « sur commande » figée dans le snapshot produit au moment de l'achat
  const madeToOrderNote = snap.is_made_to_order
    ? `<br><span style="font-size:12px;font-weight:600;color:#6d28d9;">${MADE_TO_ORDER_LABEL[locale] ?? MADE_TO_ORDER_LABEL.fr}</span>`
    : '';
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #fbcfe8;font-size:13px;color:#1E1020;">
      ${name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}${madeToOrderNote}
    </td>
    <td style="padding:8px 0;border-bottom:1px solid #fbcfe8;font-size:13px;font-weight:600;color:#1E1020;text-align:right;white-space:nowrap;">
      CHF ${price.toFixed(2)}
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────
// 1. Email de bienvenue — après inscription
// ─────────────────────────────────────────────
async function sendWelcome({ user }) {
  const locale    = user.locale ?? 'fr';
  const firstName = escapeHtml(user.first_name);

  const subjects = {
    fr: 'Bienvenue chez Au Point-Compté 🧵',
    de: 'Willkommen bei Au Point-Compté 🧵',
    en: 'Welcome to Au Point-Compté 🧵',
  };

  const bodies = {
    fr: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Bienvenue, ${firstName} !
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Votre compte Au Point-Compté est créé. Découvrez notre catalogue de broderies suisses
           — kits, fils, accessoires — livrés partout en Suisse en 1–2 jours.
         </p>
         <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
           Vous pouvez dès maintenant accéder à votre espace personnel pour suivre vos commandes,
           gérer vos adresses et consulter votre programme de fidélité.
         </p>
         ${btn(`${BASE_URL}/catalogue`, 'Découvrir la boutique')}`,
    de: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Willkommen, ${firstName}!
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Ihr Au Point-Compté Konto wurde erstellt. Entdecken Sie unsere Kollektion
           Schweizer Stickereien — Kits, Garne, Zubehör — in 1–2 Tagen schweizweit geliefert.
         </p>
         ${btn(`${BASE_URL}/catalogue`, 'Zum Shop')}`,
    en: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Welcome, ${firstName}!
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Your Au Point-Compté account is ready. Explore our Swiss embroidery collection
           — kits, threads, accessories — delivered across Switzerland in 1–2 days.
         </p>
         ${btn(`${BASE_URL}/catalogue`, 'Shop now')}`,
  };

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(bodies[locale] ?? bodies.fr, locale),
  });
}

// ─────────────────────────────────────────────
// 2. Confirmation de commande
// ─────────────────────────────────────────────
async function sendOrderConfirmation({ user, order }) {
  const locale    = user.locale ?? 'fr';
  const firstName = escapeHtml(user.first_name);
  const orderId   = parseInt(order.id, 10);

  const subjects = {
    fr: `Confirmation de votre commande #${orderId} — Au Point-Compté`,
    de: `Bestellbestätigung #${orderId} — Au Point-Compté`,
    en: `Order confirmation #${orderId} — Au Point-Compté`,
  };

  const itemsHtml = (order.items ?? []).map((item) => orderItemRow(item, locale)).join('');

  const summaryRows = {
    fr: `Sous-total|CHF ${roundCHF(order.subtotal).toFixed(2)}
Frais de port|CHF ${roundCHF(order.shipping_cost).toFixed(2)}
TVA incluse|CHF ${roundCHF(order.tax_amount).toFixed(2)}`.split('\n'),
    de: `Zwischensumme|CHF ${roundCHF(order.subtotal).toFixed(2)}
Versandkosten|CHF ${roundCHF(order.shipping_cost).toFixed(2)}
MwSt. inkl.|CHF ${roundCHF(order.tax_amount).toFixed(2)}`.split('\n'),
    en: `Subtotal|CHF ${roundCHF(order.subtotal).toFixed(2)}
Shipping|CHF ${roundCHF(order.shipping_cost).toFixed(2)}
VAT included|CHF ${roundCHF(order.tax_amount).toFixed(2)}`.split('\n'),
  };

  const summaryHtml = (summaryRows[locale] ?? summaryRows.fr).map(row => {
    const [label, val] = row.split('|');
    return `<tr>
      <td style="padding:5px 0;font-size:13px;color:#6b7280;">${label}</td>
      <td style="padding:5px 0;font-size:13px;color:#1E1020;text-align:right;">${val}</td>
    </tr>`;
  }).join('');

  const titles = {
    fr: `Merci pour votre commande, ${firstName} !`,
    de: `Vielen Dank für Ihre Bestellung, ${firstName}!`,
    en: `Thank you for your order, ${firstName}!`,
  };

  const intros = {
    fr: `Nous avons bien reçu votre commande <strong>#${orderId}</strong>.
         Vous serez notifié(e) dès l'expédition avec votre numéro de suivi Post CH.`,
    de: `Wir haben Ihre Bestellung <strong>#${orderId}</strong> erhalten.
         Sie werden benachrichtigt, sobald das Paket versendet wird.`,
    en: `We have received your order <strong>#${orderId}</strong>.
         You will be notified as soon as it ships with your Post CH tracking number.`,
  };

  const totalLabel = { fr: 'Total TTC', de: 'Gesamtbetrag', en: 'Total' };
  const detailLabel = { fr: 'Voir ma commande', de: 'Meine Bestellung ansehen', en: 'View my order' };
  const deliveryNote = {
    fr: '🚚 Livraison estimée : 1–2 jours ouvrables · La Poste Suisse',
    de: '🚚 Voraussichtliche Lieferung: 1–2 Werktage · Die Schweizer Post',
    en: '🚚 Estimated delivery: 1–2 business days · Swiss Post',
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${titles[locale] ?? titles.fr}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      ${intros[locale] ?? intros.fr}
    </p>

    <!-- Articles -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${itemsHtml}
    </table>

    <!-- Récapitulatif -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#fdf2f8;border-radius:10px;padding:16px;margin-bottom:8px;">
      ${summaryHtml}
      <tr>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#1E1020;border-top:1px solid #fbcfe8;">
          ${totalLabel[locale] ?? totalLabel.fr}
        </td>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#DB2777;text-align:right;border-top:1px solid #fbcfe8;">
          CHF ${roundCHF(order.total).toFixed(2)}
        </td>
      </tr>
    </table>

    <p style="margin:16px 0 0;font-size:12px;color:#9D6480;">
      ${deliveryNote[locale] ?? deliveryNote.fr}
    </p>

    ${btn(`${BASE_URL}/mon-compte`, detailLabel[locale] ?? detailLabel.fr)}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(body, locale),
  });
}

// ─────────────────────────────────────────────
// 3. Notification d'expédition
// ─────────────────────────────────────────────
async function sendOrderShipped({ user, order, trackingNumber }) {
  const locale          = user.locale ?? 'fr';
  const firstName       = escapeHtml(user.first_name);
  const orderId         = parseInt(order.id, 10);
  const safeTracking    = escapeHtml(trackingNumber);
  const trackUrl = `https://www.post.ch/fr/outils/suivi-de-colis?track=${encodeURIComponent(trackingNumber)}`;

  const subjects = {
    fr: `Votre commande #${orderId} est en route ! 📦`,
    de: `Ihre Bestellung #${orderId} ist unterwegs! 📦`,
    en: `Your order #${orderId} has shipped! 📦`,
  };

  const titles = {
    fr: `Votre colis est parti, ${firstName} !`,
    de: `Ihr Paket ist unterwegs, ${firstName}!`,
    en: `Your parcel is on its way, ${firstName}!`,
  };

  const intros = {
    fr: `Votre commande <strong>#${orderId}</strong> a été expédiée aujourd'hui via La Poste Suisse.
         Votre numéro de suivi :`,
    de: `Ihre Bestellung <strong>#${orderId}</strong> wurde heute über Die Schweizer Post versandt.
         Ihre Sendungsnummer:`,
    en: `Your order <strong>#${orderId}</strong> has been shipped today via Swiss Post.
         Your tracking number:`,
  };

  const trackBtns = {
    fr: 'Suivre mon colis',
    de: 'Sendung verfolgen',
    en: 'Track my parcel',
  };

  const deliveryNotes = {
    fr: 'Délai estimé : 1–2 jours ouvrables en Suisse.',
    de: 'Geschätzte Lieferzeit: 1–2 Werktage in der Schweiz.',
    en: 'Estimated delivery: 1–2 business days in Switzerland.',
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${titles[locale] ?? titles.fr}
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      ${intros[locale] ?? intros.fr}
    </p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:16px 24px;display:inline-block;font-size:18px;font-weight:700;color:#DB2777;letter-spacing:.08em;font-family:monospace;">
      ${safeTracking}
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#9D6480;">
      ${deliveryNotes[locale] ?? deliveryNotes.fr}
    </p>
    ${btn(trackUrl, trackBtns[locale] ?? trackBtns.fr)}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(body, locale),
  });
}

// ─────────────────────────────────────────────
// 4. Réinitialisation de mot de passe
// ─────────────────────────────────────────────
async function sendPasswordReset({ user, resetToken }) {
  const locale = user.locale ?? 'fr';
  const resetUrl = `${BASE_URL}/reinitialiser-mot-de-passe?token=${resetToken}`;

  const subjects = {
    fr: 'Réinitialisation de votre mot de passe — Au Point-Compté',
    de: 'Passwort zurücksetzen — Au Point-Compté',
    en: 'Reset your password — Au Point-Compté',
  };

  const titles = {
    fr: 'Réinitialisation du mot de passe',
    de: 'Passwort zurücksetzen',
    en: 'Password reset',
  };

  const intros = {
    fr: `Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton
         ci-dessous pour en choisir un nouveau. Ce lien est valable <strong>1 heure</strong>.`,
    de: `Sie haben die Zurücksetzung Ihres Passworts angefordert. Klicken Sie auf die Schaltfläche
         unten, um ein neues zu wählen. Dieser Link ist <strong>1 Stunde</strong> gültig.`,
    en: `You requested a password reset. Click the button below to choose a new password.
         This link is valid for <strong>1 hour</strong>.`,
  };

  const btnLabels = {
    fr: 'Réinitialiser mon mot de passe',
    de: 'Mein Passwort zurücksetzen',
    en: 'Reset my password',
  };

  const ignoreNotes = {
    fr: `Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email.
         Votre mot de passe ne sera pas modifié.`,
    de: `Wenn Sie diese Zurücksetzung nicht angefordert haben, ignorieren Sie diese E-Mail einfach.
         Ihr Passwort wird nicht geändert.`,
    en: `If you did not request a password reset, simply ignore this email.
         Your password will not be changed.`,
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${titles[locale] ?? titles.fr}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      ${intros[locale] ?? intros.fr}
    </p>
    ${btn(resetUrl, btnLabels[locale] ?? btnLabels.fr)}
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
      ${ignoreNotes[locale] ?? ignoreNotes.fr}
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(body, locale),
  });
}

// ─────────────────────────────────────────────
// 5. Changement de statut commande (admin)
// ─────────────────────────────────────────────
async function sendOrderStatusUpdate({ user, order, newStatus }) {
  const locale = user.locale ?? 'fr';

  const statusLabels = {
    fr: { paid: 'Payée', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée', refunded: 'Remboursée' },
    de: { paid: 'Bezahlt', shipped: 'Versendet', delivered: 'Geliefert', cancelled: 'Storniert', refunded: 'Erstattet' },
    en: { paid: 'Paid', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' },
  };

  const label = (statusLabels[locale] ?? statusLabels.fr)[newStatus] ?? newStatus;

  const subjects = {
    fr: `Commande #${order.id} — Statut : ${label}`,
    de: `Bestellung #${order.id} — Status: ${label}`,
    en: `Order #${order.id} — Status: ${label}`,
  };

  const intros = {
    fr: `Le statut de votre commande <strong>#${order.id}</strong> a été mis à jour : <strong>${label}</strong>.`,
    de: `Der Status Ihrer Bestellung <strong>#${order.id}</strong> wurde aktualisiert: <strong>${label}</strong>.`,
    en: `The status of your order <strong>#${order.id}</strong> has been updated: <strong>${label}</strong>.`,
  };

  const btnLabels = {
    fr: 'Voir ma commande',
    de: 'Meine Bestellung ansehen',
    en: 'View my order',
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Commande #${order.id}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      ${intros[locale] ?? intros.fr}
    </p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:14px 20px;font-size:14px;color:#DB2777;font-weight:600;">
      ${label}
    </div>
    ${btn(`${BASE_URL}/mon-compte`, btnLabels[locale] ?? btnLabels.fr)}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(body, locale),
  });
}

// ─────────────────────────────────────────────
// 6. Email de bienvenue migration (clients importés)
// ─────────────────────────────────────────────
async function sendMigrationWelcome({ user, resetToken }) {
  const locale    = user.locale ?? 'fr';
  const firstName = escapeHtml(user.first_name);
  const resetUrl  = `${BASE_URL}/reinitialiser-mot-de-passe?token=${resetToken}`;

  const subjects = {
    fr: 'Votre compte Au Point-Compté est prêt — choisissez votre mot de passe',
    de: 'Ihr Au Point-Compté Konto ist bereit — Wählen Sie Ihr Passwort',
    en: 'Your Au Point-Compté account is ready — choose your password',
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Bonjour ${firstName},
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      Votre compte a été transféré sur notre nouveau site. Votre email et votre historique
      de commandes sont conservés. Il vous suffit de définir un nouveau mot de passe pour
      accéder à votre espace.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Ce lien est valable <strong>48 heures</strong>.
    </p>
    ${btn(resetUrl, 'Définir mon mot de passe')}
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;">
      Si vous n'êtes pas à l'origine de cette demande, contactez-nous à
      <a href="mailto:contact@broderie-domaine.ch" style="color:#DB2777;">contact@broderie-domaine.ch</a>.
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(body, locale),
  });
}

// ─────────────────────────────────────────────
// 8. Facture QR suisse — email avec QR-facture PDF en pièce jointe
// ─────────────────────────────────────────────
async function sendInvoice({ user, order, pdfBuffer, dueDate }) {
  const locale = user.locale ?? 'fr';
  const firstName = escapeHtml(user.first_name);
  const due = new Date(dueDate).toLocaleDateString(
    locale === 'de' ? 'de-CH' : locale === 'en' ? 'en-GB' : 'fr-CH',
    { day: '2-digit', month: '2-digit', year: 'numeric' }
  );

  const subjects = {
    fr: `Votre facture QR — commande #${order.id} — Au Point-Compté`,
    de: `Ihre QR-Rechnung — Bestellung #${order.id} — Au Point-Compté`,
    en: `Your QR invoice — order #${order.id} — Au Point-Compté`,
  };

  const bodies = {
    fr: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Votre facture, ${firstName}
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Veuillez trouver en pièce jointe la facture QR de votre commande
           <strong>#${order.id}</strong> d'un montant de
           <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Réglez-la depuis votre application bancaire en scannant le QR code suisse,
           au plus tard le <strong>${due}</strong>.
         </p>`,
    de: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Ihre Rechnung, ${firstName}
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Im Anhang finden Sie die QR-Rechnung für Ihre Bestellung
           <strong>#${order.id}</strong> über
           <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Bezahlen Sie sie über Ihre Banking-App durch Scannen des Schweizer QR-Codes,
           spätestens bis zum <strong>${due}</strong>.
         </p>`,
    en: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Your invoice, ${firstName}
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Please find attached the QR invoice for your order
           <strong>#${order.id}</strong> for
           <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Pay it from your banking app by scanning the Swiss QR code,
           no later than <strong>${due}</strong>.
         </p>`,
  };

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(bodies[locale] ?? bodies.fr, locale),
    attachments: [
      {
        filename:    `facture-${order.id}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

// ─────────────────────────────────────────────
// 9. Click & Collect — commande prête pour le retrait en boutique
// ─────────────────────────────────────────────
async function sendPickupReady({ user, order }) {
  const locale    = user.locale ?? 'fr';
  const firstName = escapeHtml(user.first_name);
  const orderId   = parseInt(order.id, 10);

  // Adresse et horaires de la boutique (config)
  const shop = {
    name:    escapeHtml(env.pickupName),
    address: escapeHtml(env.pickupAddress),
    zipCity: escapeHtml(`${env.pickupZip} ${env.pickupCity}`),
    hours:   escapeHtml(env.pickupHours),
  };

  const subjects = {
    fr: `Votre commande #${orderId} est prête — Au Point-Compté`,
    de: `Ihre Bestellung #${orderId} ist abholbereit — Au Point-Compté`,
    en: `Your order #${orderId} is ready — Au Point-Compté`,
  };

  // Encart adresse + horaires, commun aux 3 langues
  const shopBlock = (labelAddress, labelHours) => `
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:16px 20px;margin:8px 0 20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9D6480;text-transform:uppercase;letter-spacing:0.04em;">${labelAddress}</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#1E1020;">${shop.name}</p>
      <p style="margin:2px 0 0;font-size:14px;color:#374151;">${shop.address}<br>${shop.zipCity}</p>
      <p style="margin:12px 0 0;font-size:12px;color:#9D6480;text-transform:uppercase;letter-spacing:0.04em;">${labelHours}</p>
      <p style="margin:2px 0 0;font-size:14px;color:#374151;">${shop.hours}</p>
    </div>`;

  const bodies = {
    fr: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Votre commande est prête, ${firstName} !
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Bonne nouvelle : votre commande <strong>#${orderId}</strong> est prête à être retirée en boutique.
           Le règlement se fera directement sur place lors du retrait.
         </p>
         ${shopBlock('Adresse de retrait', 'Horaires d\'ouverture')}
         <p style="margin:0;font-size:13px;color:#9D6480;line-height:1.7;">
           Montant à régler en boutique : <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>`,
    de: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Ihre Bestellung ist bereit, ${firstName}!
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Gute Nachrichten: Ihre Bestellung <strong>#${orderId}</strong> ist im Geschäft abholbereit.
           Die Bezahlung erfolgt direkt vor Ort bei der Abholung.
         </p>
         ${shopBlock('Abholadresse', 'Öffnungszeiten')}
         <p style="margin:0;font-size:13px;color:#9D6480;line-height:1.7;">
           Im Geschäft zu zahlender Betrag: <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>`,
    en: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Your order is ready, ${firstName}!
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Good news: your order <strong>#${orderId}</strong> is ready for collection in store.
           Payment is made directly on site at pickup.
         </p>
         ${shopBlock('Pickup address', 'Opening hours')}
         <p style="margin:0;font-size:13px;color:#9D6480;line-height:1.7;">
           Amount to pay in store: <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>`,
  };

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(bodies[locale] ?? bodies.fr, locale),
  });
}

// Email de vérification d'adresse (double opt-in) — envoyé à l'inscription
async function sendEmailVerification({ user, verifyToken }) {
  const locale = user.locale ?? 'fr';
  const verifyUrl = `${BASE_URL}/verifier-email?token=${verifyToken}`;

  const subjects = {
    fr: 'Confirmez votre adresse email — Au Point-Compté',
    de: 'Bestätigen Sie Ihre E-Mail-Adresse — Au Point-Compté',
    en: 'Confirm your email address — Au Point-Compté',
  };

  const titles = {
    fr: 'Confirmez votre adresse email',
    de: 'Bestätigen Sie Ihre E-Mail-Adresse',
    en: 'Confirm your email address',
  };

  const intros = {
    fr: `Bienvenue chez Au Point-Compté ! Pour finaliser votre inscription, confirmez votre
         adresse email en cliquant sur le bouton ci-dessous. Ce lien est valable <strong>24 heures</strong>.`,
    de: `Willkommen bei Au Point-Compté! Um Ihre Registrierung abzuschliessen, bestätigen Sie Ihre
         E-Mail-Adresse über die Schaltfläche unten. Dieser Link ist <strong>24 Stunden</strong> gültig.`,
    en: `Welcome to Au Point-Compté! To complete your registration, confirm your email address
         using the button below. This link is valid for <strong>24 hours</strong>.`,
  };

  const btnLabels = {
    fr: 'Confirmer mon adresse email',
    de: 'Meine E-Mail-Adresse bestätigen',
    en: 'Confirm my email address',
  };

  const ignoreNotes = {
    fr: `Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.`,
    de: `Wenn Sie diese Registrierung nicht veranlasst haben, ignorieren Sie diese E-Mail einfach.`,
    en: `If you did not create this account, simply ignore this email.`,
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${titles[locale] ?? titles.fr}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      ${intros[locale] ?? intros.fr}
    </p>
    ${btn(verifyUrl, btnLabels[locale] ?? btnLabels.fr)}
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
      ${ignoreNotes[locale] ?? ignoreNotes.fr}
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: subjects[locale] ?? subjects.fr,
    html:    layout(body, locale),
  });
}

module.exports = {
  sendWelcome,
  sendOrderConfirmation,
  sendOrderShipped,
  sendPasswordReset,
  sendOrderStatusUpdate,
  sendMigrationWelcome,
  sendInvoice,
  sendPickupReady,
  sendEmailVerification,
};
