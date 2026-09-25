const transporter = require('../config/mailer');
const { roundCHF } = require('../utils/chf.utils');
const { compareUnitPrice, salePercent } = require('../utils/sale.utils');
const lengthUtils = require('../utils/length.utils');
const env = require('../config/env');

const FROM     = env.mailFrom    || '"Au Point-Compté" <contact@broderie.ch>';
const BASE_URL = env.clientUrl   || 'https://broderie.ch';

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

// Délai de livraison annoncé — articles EN STOCK uniquement.
// Les produits « sur commande » ont leur propre délai (voir MADE_TO_ORDER_LABEL).
const DELIVERY_DELAY = '3 à 5 jours ouvrables';

// Mise en page HTML commune à tous les emails.
// `reason` : pourquoi la personne reçoit cet e-mail — par défaut, elle a un compte.
// À préciser pour un destinataire sans compte (inscription newsletter).
function layout(content, { reason = 'Vous recevez cet email car vous avez un compte sur Au Point-Compté.' } = {}) {
  const footerText = `${reason}<br>
         <a href="${BASE_URL}/cgv" style="color:#DB2777;">CGV</a> &nbsp;·&nbsp;
         <a href="${BASE_URL}/mon-compte" style="color:#DB2777;">Mon compte</a> &nbsp;·&nbsp;
         <a href="mailto:contact@broderie.ch" style="color:#DB2777;">Contact</a>`;

  return `<!DOCTYPE html>
<html lang="fr">
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
            ${footerText}<br><br>
            © ${new Date().getFullYear()} Au Point-Compté — Vucherens, Suisse
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

// Libellé affiché sous les produits fabriqués à la demande
const MADE_TO_ORDER_LABEL = 'Sur commande — 3 à 4 semaines';

/* Ligne de récapitulatif commande.
   `showSale` : prix normal barré et mention « En action » pour un article acheté
   en action (CLI-14) — dans l'e-mail de confirmation envoyé à la cliente. */
function orderItemRow(item, { showSale = false } = {}) {
  const snap   = typeof item.product_snapshot_json === 'string'
    ? JSON.parse(item.product_snapshot_json)
    : (item.product_snapshot_json ?? {});
  const name   = escapeHtml(snap.name ?? `Produit #${item.product_id}`);
  const price  = roundCHF(parseFloat(item.unit_price) * item.quantity);
  /* Article à la coupe : la longueur (« — 60 cm »), jamais le nombre de
     tronçons ; à la pièce : « × 3 » au-delà d'une unité. */
  const quantityNote = lengthUtils.isSoldByLength(item)
    ? ` — ${lengthUtils.lineQuantityLabel(item)}`
    : (item.quantity > 1 ? ` × ${item.quantity}` : '');
  /* Référence article (SKU) figée à l'achat — demandée par la boutique (CLI-08) :
     c'est elle qui identifie l'article sans ambiguïté, un même nom pouvant
     désigner plusieurs coloris. */
  const skuNote = snap.sku
    ? `<br><span style="font-size:12px;color:#6b7280;">Réf. ${escapeHtml(snap.sku)}</span>`
    : '';
  // Mention « sur commande » figée dans le snapshot produit au moment de l'achat
  const madeToOrderNote = snap.is_made_to_order
    ? `<br><span style="font-size:12px;font-weight:600;color:#6d28d9;">${MADE_TO_ORDER_LABEL}</span>`
    : '';
  const normalUnit = showSale ? compareUnitPrice(snap, item) : null;
  const saleNote = normalUnit !== null
    ? `<br><span style="font-size:12px;font-weight:600;color:#be185d;">En action -${salePercent(item.unit_price, normalUnit)} %</span>`
    : '';
  const normalTotal = normalUnit !== null
    ? `<span style="font-weight:400;color:#6b7280;text-decoration:line-through;margin-right:6px;">CHF ${roundCHF(normalUnit * item.quantity).toFixed(2)}</span>`
    : '';
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #fbcfe8;font-size:13px;color:#1E1020;">
      ${name}${quantityNote}${skuNote}${madeToOrderNote}${saleNote}
    </td>
    <td style="padding:8px 0;border-bottom:1px solid #fbcfe8;font-size:13px;font-weight:600;color:#1E1020;text-align:right;white-space:nowrap;">
      ${normalTotal}CHF ${price.toFixed(2)}
    </td>
  </tr>`;
}

// Libellés des moyens de paiement — mêmes termes que l'espace client
const PAYMENT_LABELS = {
  card:       'Carte bancaire',
  twint:      'Twint',
  invoice_qr: 'Facture QR',
  pickup:     'Paiement au retrait en boutique',
};

// Adresse figée sur la commande (préfixe `shipping` ou `billing`) → lignes HTML échappées.
// `withPhone` : ajoute le téléphone du destinataire (seule la livraison en porte un).
function orderAddressLines(order, prefix, { withPhone = false } = {}) {
  const f = (key) => order[`${prefix}_${key}`];
  const name   = [f('first_name'), f('last_name')].filter(Boolean).join(' ');
  const street = [f('street'), f('street_number')].filter(Boolean).join(' ');
  const city   = [f('zip'), f('city')].filter(Boolean).join(' ');
  const phone  = withPhone && f('phone') ? `Tél. ${f('phone')}` : '';
  const lines  = [name, street, city ? `${city}${f('canton') ? ` (${f('canton')})` : ''}` : '', phone]
    .filter(Boolean)
    .map(escapeHtml);
  return lines.length ? lines.join('<br>') : null;
}

/* Bloc « adresses » d'un e-mail de commande (CLI-08) : adresse de livraison —
   ou lieu de retrait pour un Click & Collect — et adresse de facturation quand
   elle diffère. `pickup` : coordonnées de la boutique, pour un retrait. */
function orderAddressBlock(order, pickup = null) {
  const cellStyle  = 'vertical-align:top;padding:0 12px 0 0;font-size:13px;color:#374151;line-height:1.6;';
  const titleStyle = 'margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#9D6480;';

  const shipping = pickup
    ? [pickup.name, pickup.address, `${pickup.zip ?? ''} ${pickup.city ?? ''}`.trim()]
        .filter(Boolean).map(escapeHtml).join('<br>')
    : orderAddressLines(order, 'shipping', { withPhone: true });
  const billing = orderAddressLines(order, 'billing');
  // Comparaison sans le téléphone : la facturation n'en porte pas
  const showBilling = billing && billing !== orderAddressLines(order, 'shipping');

  const cells = [];
  if (shipping) {
    cells.push(`<td style="${cellStyle}">
      <p style="${titleStyle}">${pickup ? 'Retrait en boutique' : 'Adresse de livraison'}</p>
      ${shipping}
    </td>`);
  }
  if (showBilling || (pickup && billing)) {
    cells.push(`<td style="${cellStyle}">
      <p style="${titleStyle}">Adresse de facturation</p>
      ${billing}
    </td>`);
  }
  if (cells.length === 0) return '';

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
      <tr>${cells.join('')}</tr>
    </table>`;
}

// Coordonnées de la boutique pour une commande à retirer — null sinon
async function pickupDetailsFor(order) {
  if (order.payment_method !== 'pickup') return null;
  /* require() local : shopSettings tire la couche base de données (voir
     sendPickupReady). */
  const { getPickupSettings } = require('./shopSettings.service');
  return getPickupSettings().catch(() => null);
}

// ─────────────────────────────────────────────
// Textes des e-mails d'inscription modifiables par la boutique (CLI-11)
// « Besoin d'avoir la main pour modifier ce texte » : Admin → Paramètres →
// E-mails (super-administrateur). Tant qu'un champ est vide, le texte actuel
// ci-dessous est envoyé, à l'identique. Le titre, le bouton, le lien de
// confirmation et la mention newsletter ne sont pas concernés.
// ─────────────────────────────────────────────
/* Texte actuel, tel qu'affiché dans l'admin sous chaque champ. Il reprend mot
   pour mot les paragraphes HTML de sendWelcome / sendEmailVerification (un test
   le vérifie). */
const DEFAULT_EMAIL_TEXTS = {
  email_welcome_text:
    `Votre compte Au Point-Compté est créé. Découvrez notre catalogue de broderies suisses — kits, fils, accessoires — livrés partout en Suisse en ${DELIVERY_DELAY} pour les articles en stock.\n\n`
    + 'Vous pouvez dès maintenant accéder à votre espace personnel pour suivre vos commandes, gérer vos adresses et consulter votre programme de fidélité.',
  email_verify_text:
    'Bienvenue chez Au Point-Compté ! Pour finaliser votre inscription, confirmez votre adresse email en cliquant sur le bouton ci-dessous. Ce lien est valable 24 heures.',
};

/* Texte saisi dans l'admin → paragraphes HTML. Tout est échappé : c'est du
   texte, pas du code. Une ligne vide sépare deux paragraphes. */
function customTextHtml(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/* Textes saisis dans l'admin — require local : shopSettings tire la couche base
   de données. Une lecture impossible n'empêche jamais l'envoi : le texte actuel
   part à la place. */
async function emailTexts() {
  try {
    const { getEmailSettings } = require('./shopSettings.service');
    return await getEmailSettings();
  } catch (err) {
    console.error('[Email] Textes personnalisés illisibles, texte actuel utilisé :', err.message);
    return { welcomeText: null, verifyText: null };
  }
}

// ─────────────────────────────────────────────
// 1. Email de bienvenue — après inscription
// ─────────────────────────────────────────────
async function sendWelcome({ user }) {
  const firstName = escapeHtml(user.first_name);
  const { welcomeText } = await emailTexts();

  const text = welcomeText
    ? customTextHtml(welcomeText)
    : `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Votre compte Au Point-Compté est créé. Découvrez notre catalogue de broderies suisses
           — kits, fils, accessoires — livrés partout en Suisse en ${DELIVERY_DELAY}
           pour les articles en stock.
         </p>
         <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
           Vous pouvez dès maintenant accéder à votre espace personnel pour suivre vos commandes,
           gérer vos adresses et consulter votre programme de fidélité.
         </p>`;

  const body = `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Bienvenue, ${firstName} !
         </h1>
         ${text}
         ${btn(`${BASE_URL}/catalogue`, 'Découvrir la boutique')}`;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: 'Bienvenue chez Au Point-Compté 🧵',
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// 2. Confirmation de commande
// ─────────────────────────────────────────────
async function sendOrderConfirmation({ user, order }) {
  const firstName = escapeHtml(user.first_name);
  const orderId   = parseInt(order.id, 10);

  const itemsHtml = (order.items ?? []).map((item) => orderItemRow(item, { showSale: true })).join('');

  /* TVA au centime, comme sur la facture (ADM-14) : arrondie au 0.05 comme un
     montant à payer, elle affichait 1.60 quand la facture en imprime 1.61.
     Code promo : `subtotal` est stocké APRÈS remise. Comme sur la facture, on
     affiche le montant des articles puis la remise — sans elle, le sous-total
     ne correspondait plus aux lignes et la remise n'apparaissait nulle part. */
  const discount = roundCHF(parseFloat(order.discount) || 0);
  const summaryRows = [
    `Sous-total|CHF ${roundCHF(parseFloat(order.subtotal) + discount).toFixed(2)}`,
    ...(discount > 0 ? [`Remise${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ''}|− CHF ${discount.toFixed(2)}`] : []),
    `Frais de port|CHF ${roundCHF(order.shipping_cost).toFixed(2)}`,
    `TVA incluse|CHF ${Number(order.tax_amount).toFixed(2)}`,
  ];

  const summaryHtml = summaryRows.map(row => {
    const [label, val] = row.split('|');
    return `<tr>
      <td style="padding:5px 0;font-size:13px;color:#6b7280;">${label}</td>
      <td style="padding:5px 0;font-size:13px;color:#1E1020;text-align:right;">${val}</td>
    </tr>`;
  }).join('');

  const title = `Merci pour votre commande, ${firstName} !`;

  const pickup   = await pickupDetailsFor(order);
  const isPickup = order.payment_method === 'pickup';

  /* Click & Collect : ni expédition ni numéro de suivi — la cliente est
     prévenue par un e-mail dédié quand sa commande est prête. */
  const intro = isPickup
    ? `Nous avons bien reçu votre commande <strong>#${orderId}</strong>.
         Nous vous écrirons dès qu'elle sera prête à être retirée en boutique.`
    : `Nous avons bien reçu votre commande <strong>#${orderId}</strong>.
         Vous serez notifié(e) dès l'expédition avec votre numéro de suivi Post CH.`;

  const totalLabel   = 'Total TTC';
  const detailLabel  = 'Voir ma commande';
  const deliveryNote = isPickup
    ? '🏪 Retrait en boutique — paiement sur place'
    : `🚚 Livraison estimée : ${DELIVERY_DELAY} pour les articles en stock · La Poste Suisse`;

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${title}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      ${intro}
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
          ${totalLabel}
        </td>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#DB2777;text-align:right;border-top:1px solid #fbcfe8;">
          CHF ${roundCHF(order.total).toFixed(2)}
        </td>
      </tr>
    </table>

    ${orderAddressBlock(order, pickup)}

    <p style="margin:16px 0 0;font-size:12px;color:#9D6480;">
      ${deliveryNote}
    </p>

    ${btn(`${BASE_URL}/commandes/${orderId}`, detailLabel)}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: `Confirmation de votre commande #${orderId} — Au Point-Compté`,
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// 2bis. Notification interne — nouvelle commande (boutique)
// N'envoie rien si MAIL_CONTACT n'est pas configuré.
// ─────────────────────────────────────────────
async function sendAdminOrderNotification({ user, order }) {
  if (!env.mailContact) return;

  const orderId    = parseInt(order.id, 10);
  const itemsHtml   = (order.items ?? []).map((item) => orderItemRow(item)).join('');
  const clientName  = `${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}`.trim() || user.email;
  const pickup      = await pickupDetailsFor(order);
  /* Le statut technique (« pending_invoice ») s'affichait ici à la place du
     moyen de paiement. */
  const paymentLabel = PAYMENT_LABELS[order.payment_method] ?? order.payment_method ?? '—';

  /* Demande de facture imprimée : encart bien visible, c'est une action manuelle
     à faire au moment de préparer le colis — facile à manquer sinon. */
  const printedInvoiceNotice = order.wants_printed_invoice
    ? `<div style="margin:0 0 24px;padding:14px 18px;background:#fef3c7;border-left:4px solid #d97706;border-radius:8px;">
         <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;">
           🖶 Facture imprimée demandée
         </p>
         <p style="margin:4px 0 0;font-size:13px;color:#92400e;line-height:1.6;">
           La cliente souhaite une facture papier jointe au colis.
         </p>
       </div>`
    : '';

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Nouvelle commande #${orderId}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Client : <strong>${clientName}</strong> (${escapeHtml(user.email)})<br>
      ${pickup && order.shipping_phone ? `Téléphone : <strong>${escapeHtml(order.shipping_phone)}</strong><br>` : ''}
      Moyen de paiement : <strong>${escapeHtml(paymentLabel)}</strong>
    </p>

    ${printedInvoiceNotice}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${itemsHtml}
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#fdf2f8;border-radius:10px;padding:16px;">
      <tr>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#1E1020;">Total TTC</td>
        <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#DB2777;text-align:right;">
          CHF ${roundCHF(order.total).toFixed(2)}
        </td>
      </tr>
    </table>

    ${orderAddressBlock(order, pickup)}

    ${env.adminUrl ? btn(`${env.adminUrl.replace(/\/$/, '')}/commandes/${orderId}`, 'Voir la commande') : ''}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      env.mailContact,
    subject: `🛒 Nouvelle commande #${orderId} — CHF ${roundCHF(order.total).toFixed(2)}${order.wants_printed_invoice ? ' — facture papier' : ''}`,
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// 3. Notification d'expédition
// ─────────────────────────────────────────────
async function sendOrderShipped({ user, order, trackingNumber }) {
  const firstName       = escapeHtml(user.first_name);
  const orderId         = parseInt(order.id, 10);
  const safeTracking    = escapeHtml(trackingNumber);
  const trackUrl = `https://www.post.ch/fr/outils/suivi-de-colis?track=${encodeURIComponent(trackingNumber)}`;

  const title = `Votre colis est parti, ${firstName} !`;

  const intro = `Votre commande <strong>#${orderId}</strong> a été expédiée aujourd'hui via La Poste Suisse.
         Votre numéro de suivi :`;

  const trackBtn = 'Suivre mon colis';

  // Colis déjà remis à la poste : seul l'acheminement reste, la préparation est faite.
  const deliveryNote = 'Délai d\'acheminement : 1 à 2 jours ouvrables en Suisse.';

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      ${title}
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      ${intro}
    </p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:16px 24px;display:inline-block;font-size:18px;font-weight:700;color:#DB2777;letter-spacing:.08em;font-family:monospace;">
      ${safeTracking}
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#9D6480;">
      ${deliveryNote}
    </p>
    ${btn(trackUrl, trackBtn)}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: `Votre commande #${orderId} est en route ! 📦`,
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// 4. Réinitialisation de mot de passe
// ─────────────────────────────────────────────
async function sendPasswordReset({ user, resetToken }) {
  const resetUrl = `${BASE_URL}/reinitialiser-mot-de-passe?token=${resetToken}`;

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Réinitialisation du mot de passe
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton
      ci-dessous pour en choisir un nouveau. Ce lien est valable <strong>1 heure</strong>.
    </p>
    ${btn(resetUrl, 'Réinitialiser mon mot de passe')}
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
      Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email.
      Votre mot de passe ne sera pas modifié.
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: 'Réinitialisation de votre mot de passe — Au Point-Compté',
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// 4 bis. Nouvel accès au back-office (compte super-administrateur, ADM-08)
// Même lien que la réinitialisation, mais un texte fait pour un compte que la
// personne n'a pas demandé elle-même : l'e-mail de réinitialisation (« Vous avez
// demandé… si ce n'est pas vous, ignorez cet email ») invitait à l'ignorer, et
// ne disait ni où se connecter ni qu'il faudrait configurer la double
// authentification.
// ─────────────────────────────────────────────
async function sendBackOfficeInvitation({ user, resetToken }) {
  const passwordUrl = `${BASE_URL}/reinitialiser-mot-de-passe?token=${resetToken}`;
  const adminUrl    = `${BASE_URL}/admin/`;
  const adminLabel  = adminUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Votre accès à l'administration
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      Un accès administrateur à la boutique Au Point-Compté a été créé pour cette adresse.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
      <strong>1. Choisissez votre mot de passe</strong> : au moins 12 caractères, dont une
      majuscule. Ce lien est valable <strong>1 heure</strong>.
    </p>
    ${btn(passwordUrl, 'Choisir mon mot de passe')}
    <p style="margin:28px 0 0;font-size:14px;color:#374151;line-height:1.7;">
      <strong>2. Connectez-vous</strong> ensuite sur
      <a href="${adminUrl}" style="color:#DB2777;">${adminLabel}</a>. À la première connexion,
      l'administration vous demande de configurer la double authentification : gardez votre
      téléphone à portée de main, avec une application d'authentification (Google
      Authenticator, Authy, 1Password…).
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
      Lien expiré ? Un nouveau lien peut vous être envoyé sur simple demande.
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: 'Votre accès à l\'administration — Au Point-Compté',
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// 8. Facture QR suisse — email avec QR-facture PDF en pièce jointe
// ─────────────────────────────────────────────
async function sendInvoice({ user, order, pdfBuffer, dueDate }) {
  const firstName = escapeHtml(user.first_name);
  // Heure suisse, comme sur la facture PDF : le serveur tourne en UTC, et une
  // commande passée peu après minuit y portait une échéance différente
  const due = new Date(dueDate).toLocaleDateString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich',
  });

  const body = `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
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
         </p>`;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: `Votre facture QR — commande #${order.id} — Au Point-Compté`,
    html:    layout(body),
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
  const firstName = escapeHtml(user.first_name);
  const orderId   = parseInt(order.id, 10);

  /* Adresse et horaires du retrait — éditables depuis l'administration
     (Paramètres → Retrait), avec repli sur la configuration serveur tant
     qu'aucune valeur n'y a été saisie. */
  /* require() local et non en tête de fichier : shopSettings tire la couche base
     de données, et ce module doit rester chargeable sans elle (tests, envoi
     d'emails dans un contexte sans pool). */
  const { getPickupSettings } = require('./shopSettings.service');
  const pickup = await getPickupSettings();
  const shop = {
    name:    escapeHtml(pickup.name),
    address: escapeHtml(pickup.address),
    zipCity: escapeHtml(`${pickup.zip ?? ''} ${pickup.city ?? ''}`.trim()),
    hours:   escapeHtml(pickup.hours),
  };

  // Encart adresse + horaires de la boutique
  const shopBlock = (labelAddress, labelHours) => `
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:16px 20px;margin:8px 0 20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9D6480;text-transform:uppercase;letter-spacing:0.04em;">${labelAddress}</p>
      <p style="margin:0;font-size:14px;font-weight:700;color:#1E1020;">${shop.name}</p>
      <p style="margin:2px 0 0;font-size:14px;color:#374151;">${shop.address}<br>${shop.zipCity}</p>
      <p style="margin:12px 0 0;font-size:12px;color:#9D6480;text-transform:uppercase;letter-spacing:0.04em;">${labelHours}</p>
      <p style="margin:2px 0 0;font-size:14px;color:#374151;">${shop.hours}</p>
    </div>`;

  const body = `<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
           Votre commande est prête, ${firstName} !
         </h1>
         <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
           Bonne nouvelle : votre commande <strong>#${orderId}</strong> est prête à être retirée en boutique.
           Le règlement se fera directement sur place lors du retrait.
         </p>
         ${shopBlock('Adresse de retrait', 'Horaires d\'ouverture')}
         <p style="margin:0;font-size:13px;color:#9D6480;line-height:1.7;">
           Montant à régler en boutique : <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
         </p>`;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: `Votre commande #${orderId} est prête — Au Point-Compté`,
    html:    layout(body),
  });
}

// Email de vérification d'adresse (double opt-in) — envoyé à l'inscription
/* Encart « newsletter » de l'e-mail de vérification (CLI-05).
   La case newsletter cochée à l'inscription est activée par CE clic : l'e-mail
   doit donc l'annoncer, avec le moyen de se désinscrire. Il activait l'abonnement
   sans en dire un mot — c'est ce que la cliente a relevé comme non conforme. */
const newsletterConsentNotice = `
    <div style="margin:0 0 24px;padding:14px 18px;background:#fdf2f8;border-left:4px solid #DB2777;border-radius:8px;">
      <p style="margin:0;font-size:13px;color:#1E1020;line-height:1.7;">
        Vous avez aussi demandé à recevoir notre <strong>newsletter</strong>. <strong>En confirmant
        votre adresse, vous confirmez également cette inscription.</strong>
      </p>
      <p style="margin:8px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
        Vous pourrez vous désinscrire à tout moment, en un clic, grâce au lien présent dans chaque
        newsletter. Votre adresse sert uniquement à cet envoi et n'est jamais cédée à des tiers —
        <a href="${BASE_URL}/mentions-legales#donnees" style="color:#DB2777;">protection des données</a>.
      </p>
    </div>`;

async function sendEmailVerification({ user, verifyToken, newsletter = false }) {
  const verifyUrl = `${BASE_URL}/verifier-email?token=${verifyToken}`;
  const { verifyText } = await emailTexts();

  // Texte saisi dans l'admin (CLI-11), sinon le texte actuel
  const intro = verifyText
    ? customTextHtml(verifyText)
    : `<p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Bienvenue chez Au Point-Compté ! Pour finaliser votre inscription, confirmez votre
      adresse email en cliquant sur le bouton ci-dessous. Ce lien est valable <strong>24 heures</strong>.
    </p>`;

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Confirmez votre adresse email
    </h1>
    ${intro}
    ${newsletter ? newsletterConsentNotice : ''}
    ${btn(verifyUrl, 'Confirmer mon adresse email')}
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
      Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: 'Confirmez votre adresse email — Au Point-Compté',
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// Confirmation d'inscription à la newsletter (double opt-in) — CLI-05
// Envoyé à la demande faite depuis le formulaire du site. L'inscription ne
// devient effective qu'au clic : l'e-mail dit donc clairement ce qui est
// confirmé, par qui, pour quoi, et comment revenir en arrière (nLPD / RGPD).
// ─────────────────────────────────────────────
async function sendNewsletterConfirmation({ email, confirmUrl }) {
  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Confirmez votre inscription à la newsletter
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      Bonjour,<br><br>
      Vous avez demandé à recevoir la newsletter d'<strong>Au Point-Compté</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Pour valider votre inscription, cliquez sur le bouton ci-dessous. Tant que vous ne l'avez
      pas fait, vous ne recevrez rien. Ce lien est valable <strong>7 jours</strong>.
    </p>
    ${btn(confirmUrl, 'Je confirme mon inscription')}
    <div style="margin:24px 0 0;padding:14px 18px;background:#fdf2f8;border-radius:8px;">
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
        <strong style="color:#1E1020;">Vos droits</strong><br>
        Vous pourrez vous désinscrire à tout moment, en un clic, grâce au lien présent dans chaque
        newsletter. Votre adresse (${escapeHtml(email)}) sert uniquement à cet envoi et n'est jamais
        cédée à des tiers. Responsable : Au Point-Compté, Chemin du Collège 6, 1509 Vucherens —
        <a href="${BASE_URL}/mentions-legales#donnees" style="color:#DB2777;">protection des données</a>.
      </p>
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#9D6480;line-height:1.7;">
      Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email :
      vous ne serez pas inscrit(e).
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: 'Confirmez votre inscription à la newsletter — Au Point-Compté',
    html:    layout(body, {
      reason: 'Vous recevez cet email car une inscription à la newsletter a été demandée avec cette adresse.',
    }),
  });
}

// ─────────────────────────────────────────────
// MFA (admin) — emails adressés uniquement aux comptes admin.
// ─────────────────────────────────────────────

// Alerte : le dernier code de récupération MFA vient d'être utilisé
async function sendMfaRecoveryCodesLow(user) {
  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Codes de récupération épuisés
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      Vous venez d'utiliser votre <strong>dernier code de récupération</strong> pour la double
      authentification de votre compte admin. Régénérez un nouveau jeu de codes dès que possible
      depuis les paramètres de sécurité de votre compte, pour ne pas rester bloqué en cas de
      perte de votre application d'authentification.
    </p>
    ${btn(`${env.adminUrl || BASE_URL}/parametres`, 'Régénérer mes codes')}
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: 'Codes de récupération MFA épuisés — Au Point-Compté',
    html:    layout(body),
  });
}

// Confirmation : de nouveaux codes de récupération viennent d'être générés
async function sendMfaRecoveryCodesRegenerated(user) {
  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Codes de récupération régénérés
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
      De nouveaux codes de récupération MFA ont été générés pour votre compte admin. Les anciens
      codes ne sont plus valides. Si vous n'êtes pas à l'origine de cette action,
      contactez immédiatement le support.
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: 'Codes de récupération MFA régénérés — Au Point-Compté',
    html:    layout(body),
  });
}

// ─────────────────────────────────────────────
// Paiement Twint par QR code — envoyé par l'admin depuis le back-office
// Image QR jointe en inline (cid:) — pas en pièce jointe téléchargeable.
// `payUrl` : le même paiement en bouton — un QR ne se scanne pas depuis l'écran
// du téléphone sur lequel on lit l'e-mail.
// ─────────────────────────────────────────────
async function sendTwintQrEmail({ user, order, qrBuffer, payUrl, expiresAt }) {
  const firstName = escapeHtml(user.first_name);
  // Heure suisse : le serveur tourne en UTC, l'échéance affichait 2 h de moins
  const expiresLabel = new Date(expiresAt).toLocaleString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Zurich',
  });

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#1E1020;">
      Payez votre commande avec Twint, ${firstName}
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      Voici le QR code de paiement pour votre commande <strong>#${order.id}</strong>
      d'un montant de <strong>CHF ${roundCHF(order.total).toFixed(2)}</strong>.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
      <strong>Sur votre téléphone :</strong> touchez le bouton ci-dessous, puis
      confirmez le paiement dans l'application Twint.
    </p>
    <div style="text-align:center;margin:0 0 28px;">
      ${btn(escapeHtml(payUrl), 'Payer avec Twint')}
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
      <strong>Sur un ordinateur :</strong> scannez ce QR code avec l'appareil photo
      de votre téléphone, puis confirmez le paiement dans l'application Twint.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <img src="cid:twint-qr" alt="QR code de paiement Twint" width="280" height="280"
           style="display:inline-block;border:1px solid #fbcfe8;border-radius:12px;padding:12px;" />
    </div>
    <p style="margin:0;font-size:13px;color:#9D6480;line-height:1.7;">
      Ce QR code et ce bouton sont valables jusqu'au <strong>${expiresLabel}</strong>.
      Passé ce délai, contactez-nous pour recevoir un nouveau code.
    </p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to:      user.email,
    subject: `Payer par Twint — commande #${order.id} — Au Point-Compté`,
    html:    layout(body),
    attachments: [
      {
        filename:    `twint-${order.id}.png`,
        content:     qrBuffer,
        contentType: 'image/png',
        cid:         'twint-qr',
      },
    ],
  });
}

module.exports = {
  DEFAULT_EMAIL_TEXTS,
  sendWelcome,
  sendOrderConfirmation,
  sendAdminOrderNotification,
  sendOrderShipped,
  sendPasswordReset,
  sendBackOfficeInvitation,
  sendInvoice,
  sendPickupReady,
  sendEmailVerification,
  sendNewsletterConfirmation,
  sendMfaRecoveryCodesLow,
  sendMfaRecoveryCodesRegenerated,
  sendTwintQrEmail,
};
