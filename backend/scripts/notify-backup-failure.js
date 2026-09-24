#!/usr/bin/env node
/* ============================================================
 * Alerte e-mail — échec d'une sauvegarde (ticket ADM-11)
 *
 * Appelé par deploy/backup-broderie.sh quand une étape échoue. Une sauvegarde
 * qui s'arrête en silence est le pire cas : on découvre qu'elle manque le jour
 * où l'on en a besoin. L'e-mail part avec la configuration d'envoi du site
 * (backend/.env), sans autre dépendance sur le serveur.
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/notify-backup-failure.js <destinataire> <étape> [fichier journal]
 *
 * Ne renvoie jamais d'erreur bloquante : si l'e-mail lui-même échoue, le
 * message reste dans le journal de la sauvegarde.
 * ============================================================ */

const fs = require('fs');
const transporter = require('../config/mailer');
const env = require('../config/env');

const [, , to, step = 'sauvegarde', logFile] = process.argv;

// Dernières lignes du journal : c'est là qu'est écrite la cause de l'échec
function lastLogLines(file, count = 20) {
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-count).join('\n');
  } catch {
    return '';
  }
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('[Alerte sauvegarde] Destinataire manquant ou invalide.');
    return;
  }
  const lines = lastLogLines(logFile);
  const when = new Date().toLocaleString('fr-CH', { timeZone: 'Europe/Zurich' });

  await transporter.sendMail({
    from:    env.mailFrom || '"Au Point-Compté" <contact@broderie.ch>',
    to,
    subject: `⚠️ Sauvegarde broderie.ch échouée — ${step}`,
    text:    `La sauvegarde « ${step} » a échoué le ${when} (heure suisse).\n\n`
           + 'Dernières lignes du journal :\n\n'
           + (lines || '(journal indisponible)')
           + '\n\nJournal complet sur le serveur : /var/log/backup-broderie.log',
    html:    `<p>La sauvegarde <strong>« ${escapeHtml(step)} »</strong> a échoué le ${escapeHtml(when)} (heure suisse).</p>`
           + '<p>Dernières lignes du journal :</p>'
           + `<pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:12px;">${escapeHtml(lines || '(journal indisponible)')}</pre>`
           + '<p>Journal complet sur le serveur : <code>/var/log/backup-broderie.log</code></p>',
  });
  console.log(`[Alerte sauvegarde] E-mail envoyé à ${to}.`);
}

main()
  .catch((err) => console.error('[Alerte sauvegarde] Envoi impossible :', err.message))
  .finally(() => process.exit(0));
