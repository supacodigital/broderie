const transporter = require('../config/mailer');
const { roundCHF } = require('../utils/chf.utils');

const FROM = process.env.MAIL_FROM || '"Au Point-Compté" <noreply@broderie-domaine.ch>';
const BASE_URL = process.env.CLIENT_URL || 'https://broderie-domaine.ch';

// ─────────────────────────────────────────────
// Helpers communs
// ─────────────────────────────────────────────

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

// Ligne de récapitulatif commande
function orderItemRow(item) {
  const snap   = typeof item.product_snapshot_json === 'string'
    ? JSON.parse(item.product_snapshot_json)
    : (item.product_snapshot_json ?? {});
  const name   = snap.name ?? `Produit #${item.product_id}`;
  const price  = roundCHF(parseFloat(item.unit_price) * item.quantity);
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #fbcfe8;font-size:13px;color:#1E1020;">
      ${name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}
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
  const locale = user.locale ?? 'fr';

  const subjects = {
    fr: 'Bienvenue chez Au Point-Compté 🧵',
    de: 'Willkommen bei Au Point-Compté 🧵',
    en: 'Welcome to Au Point-Compté 🧵',
  };

  const bodies = {
    fr: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Bienvenue, ${user.first_name} !
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
           Willkommen, ${user.first_name}!
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Ihr Au Point-Compté Konto wurde erstellt. Entdecken Sie unsere Kollektion
           Schweizer Stickereien — Kits, Garne, Zubehör — in 1–2 Tagen schweizweit geliefert.
         </p>
         ${btn(`${BASE_URL}/catalogue`, 'Zum Shop')}`,
    en: `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Welcome, ${user.first_name}!
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
  const locale = user.locale ?? 'fr';

  const subjects = {
    fr: `Confirmation de votre commande #${order.id} — Au Point-Compté`,
    de: `Bestellbestätigung #${order.id} — Au Point-Compté`,
    en: `Order confirmation #${order.id} — Au Point-Compté`,
  };

  const itemsHtml = (order.items ?? []).map(orderItemRow).join('');

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
    fr: `Merci pour votre commande, ${user.first_name} !`,
    de: `Vielen Dank für Ihre Bestellung, ${user.first_name}!`,
    en: `Thank you for your order, ${user.first_name}!`,
  };

  const intros = {
    fr: `Nous avons bien reçu votre commande <strong>#${order.id}</strong>.
         Vous serez notifié(e) dès l'expédition avec votre numéro de suivi Post CH.`,
    de: `Wir haben Ihre Bestellung <strong>#${order.id}</strong> erhalten.
         Sie werden benachrichtigt, sobald das Paket versendet wird.`,
    en: `We have received your order <strong>#${order.id}</strong>.
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
  const locale = user.locale ?? 'fr';

  const subjects = {
    fr: `Votre commande #${order.id} est en route ! 📦`,
    de: `Ihre Bestellung #${order.id} ist unterwegs! 📦`,
    en: `Your order #${order.id} has shipped! 📦`,
  };

  const titles = {
    fr: `Votre colis est parti, ${user.first_name} !`,
    de: `Ihr Paket ist unterwegs, ${user.first_name}!`,
    en: `Your parcel is on its way, ${user.first_name}!`,
  };

  const intros = {
    fr: `Votre commande <strong>#${order.id}</strong> a été expédiée aujourd'hui via La Poste Suisse.
         Votre numéro de suivi :`,
    de: `Ihre Bestellung <strong>#${order.id}</strong> wurde heute über Die Schweizer Post versandt.
         Ihre Sendungsnummer:`,
    en: `Your order <strong>#${order.id}</strong> has been shipped today via Swiss Post.
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

  const trackUrl = `https://www.post.ch/fr/outils/suivi-de-colis?track=${trackingNumber}`;

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${titles[locale] ?? titles.fr}
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      ${intros[locale] ?? intros.fr}
    </p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:16px 24px;display:inline-block;font-size:18px;font-weight:700;color:#DB2777;letter-spacing:.08em;font-family:monospace;">
      ${trackingNumber}
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
  const locale = user.locale ?? 'fr';
  const resetUrl = `${BASE_URL}/reinitialiser-mot-de-passe?token=${resetToken}`;

  const subjects = {
    fr: 'Votre compte Au Point-Compté est prêt — choisissez votre mot de passe',
    de: 'Ihr Au Point-Compté Konto ist bereit — Wählen Sie Ihr Passwort',
    en: 'Your Au Point-Compté account is ready — choose your password',
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Bonjour ${user.first_name},
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
// 8. QR Twint envoyé par email (depuis l'admin)
// ─────────────────────────────────────────────
async function sendTwintQr({ user, order, qrBuffer, expiresAt }) {
  const locale  = user.locale ?? 'fr';
  const expires = new Date(expiresAt).toLocaleString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const subjects = {
    fr: `Payez votre commande #${order.id} par Twint — Au Point-Compté`,
    de: `Bezahlen Sie Ihre Bestellung #${order.id} mit Twint — Au Point-Compté`,
    en: `Pay your order #${order.id} with Twint — Au Point-Compté`,
  };

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Payez par Twint
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
      Scannez le QR code ci-dessous avec votre application <strong>Twint</strong> pour régler
      votre commande <strong>#${order.id}</strong> d'un montant de
      <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
    </p>

    <!-- QR code intégré -->
    <div style="text-align:center;margin:24px 0;">
      <img src="cid:twint-qr" alt="QR Code Twint" width="240" height="240"
           style="border:1px solid #fbcfe8;border-radius:12px;padding:12px;" />
    </div>

    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:14px 20px;text-align:center;margin-bottom:20px;">
      <p style="margin:0;font-size:12px;color:#9D6480;">Ce QR code expire le</p>
      <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#DB2777;">${expires}</p>
    </div>

    <p style="margin:0;font-size:13px;color:#9D6480;line-height:1.7;">
      Ouvrez l'application Twint sur votre téléphone, appuyez sur "Scanner" et pointez
      la caméra vers ce QR code. Le paiement sera confirmé instantanément.
    </p>
  `;

  await transporter.sendMail({
    from:        FROM,
    to:          user.email,
    subject:     subjects[locale] ?? subjects.fr,
    html:        layout(body, locale),
    attachments: [
      {
        filename:    'twint-qr.png',
        content:     qrBuffer,
        contentType: 'image/png',
        cid:         'twint-qr',
      },
    ],
  });
}

module.exports = {
  sendWelcome,
  sendOrderConfirmation,
  sendOrderShipped,
  sendPasswordReset,
  sendOrderStatusUpdate,
  sendMigrationWelcome,
  sendTwintQr,
};
