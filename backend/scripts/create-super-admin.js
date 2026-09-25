#!/usr/bin/env node
/* ============================================================
 * Création du compte super-administrateur — ticket ADM-08
 *
 * « Créer un profil super-administrateur avec accès complet aux pages de
 * contenu et blocs promotionnels. » Le super-administrateur a tout ce qu'a un
 * administrateur, plus les CGV, mentions légales, Notre Histoire, le bandeau
 * d'annonce et les blocs de la page d'accueil (middlewares/roles.js).
 *
 * Aucun mot de passe ne passe par ce script : le compte est créé sans mot de
 * passe, et son titulaire reçoit le lien « choisir mon mot de passe » (valable
 * 1 heure). À sa première connexion, l'administration lui fait configurer la
 * double authentification, obligatoire comme pour tout compte du back-office.
 *
 * Usage (depuis backend/) :
 *   node -r dotenv/config scripts/create-super-admin.js --email x@y.ch --first Julie --last Guerle
 *        → simulation : affiche ce qui serait créé
 *   … --create   → crée le compte et envoie le lien
 *   node -r dotenv/config scripts/create-super-admin.js --email x@y.ch --resend
 *        → renvoie le lien (lien expiré ou e-mail égaré)
 * ============================================================ */

const crypto = require('crypto');
const { pool } = require('../config/db');
const userRepository = require('../repositories/user.repository');
const emailService = require('../services/email.service');

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? '').trim() : '';
};
const EMAIL = argValue('--email').toLowerCase();
const FIRST = argValue('--first');
const LAST = argValue('--last');
const CREATE = args.includes('--create');
const RESEND = args.includes('--resend');
const RESET_LINK_TTL_MS = 60 * 60 * 1000; // même durée que « mot de passe oublié »

/* Lien « choisir mon mot de passe » — même mécanisme que la réinitialisation
   (auth.service forgotPassword), mais l'envoi est ATTENDU : un script qui se
   termine avant l'envoi ferait croire à un e-mail parti.
   E-mail d'invitation et non de réinitialisation : ce dernier (« si vous
   n'avez pas fait cette demande, ignorez cet email ») invitait à l'ignorer. */
async function sendPasswordLink(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await userRepository.saveResetToken(user.id, tokenHash, new Date(Date.now() + RESET_LINK_TTL_MS));
  await emailService.sendBackOfficeInvitation({ user, resetToken: rawToken });
}

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) {
    throw new Error('Adresse e-mail manquante ou invalide (--email).');
  }
  const existing = await userRepository.findByEmail(EMAIL);

  if (RESEND) {
    if (!existing || existing.role !== 'super_admin') {
      throw new Error(`Aucun compte super-administrateur pour ${EMAIL}.`);
    }
    await sendPasswordLink(existing);
    console.log(`\nLien « choisir mon mot de passe » renvoyé à ${EMAIL} (valable 1 heure).\n`);
    return;
  }

  if (!FIRST || !LAST) throw new Error('Prénom et nom requis (--first, --last).');
  /* Jamais de promotion silencieuse : un compte client existant garderait ses
     commandes et son historique sous un profil qui n'a rien à voir. */
  if (existing) {
    throw new Error(`Un compte existe déjà pour ${EMAIL} (rôle ${existing.role}) — choisir une autre adresse.`);
  }

  console.log(`\nCompte à créer : ${FIRST} ${LAST} <${EMAIL}> — super-administrateur`);
  if (!CREATE) {
    console.log('Simulation : rien n\'a été créé. Relancer avec --create.\n');
    return;
  }

  const id = await userRepository.createBackOfficeAccount({
    email: EMAIL, firstName: FIRST, lastName: LAST, role: 'super_admin',
  });
  await sendPasswordLink({ id, email: EMAIL, first_name: FIRST, last_name: LAST, locale: 'fr' });
  console.log(`✓ Compte n° ${id} créé. Lien « choisir mon mot de passe » envoyé à ${EMAIL} (valable 1 heure).`);
  console.log('  À la première connexion : configuration de la double authentification.\n');
}

main()
  .catch((err) => { console.error(`\n✗ ${err.message}\n`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
