# Gestion des emails — Guide

Ce document explique **comment fonctionnent les emails du site**, ce qui est déjà prêt,
et **ce qu'il reste à configurer en production**. Aucun développement n'est nécessaire :
tout le code est écrit — il faut seulement renseigner des variables d'environnement.

---

## 1. Comment ça marche (en une phrase)

Le site envoie ses emails via **Nodemailer**, connecté à un serveur **SMTP** (le serveur
qui expédie réellement les messages). Tout est piloté par des **variables d'environnement** :
changer d'expéditeur ou de fournisseur = changer une variable, pas le code.

Fichiers concernés (pour info, à ne pas modifier normalement) :
- `backend/config/mailer.js` — la connexion SMTP
- `backend/services/email.service.js` — le contenu des emails (traduits FR / DE / EN)

---

## 2. Les emails envoyés automatiquement

Tous ces emails existent déjà et sont traduits selon la langue du client (FR / DE-CH / EN) :

| Email | Quand il part |
| --- | --- |
| **Bienvenue** | À l'inscription |
| **Vérification d'adresse email** | À l'inscription (lien « Confirmer mon adresse ») |
| **Confirmation de commande** | Commande validée (avec détail TVA) |
| **Changement de statut** | Statut de commande modifié (ex. expédiée, remboursée) |
| **Expédition** | Colis expédié (avec numéro de suivi) |
| **Facture** | Facture QR envoyée (paiement sur facture) |
| **Retrait en boutique prêt** | Click & Collect prêt |
| **Réinitialisation mot de passe** | Demande « mot de passe oublié » |
| **Bienvenue migration** | Import des anciens clients (lien pour définir le mot de passe) |

> Le **formulaire de contact** du site n'envoie pas un email « automatique » : il transmet
> le message du visiteur à l'adresse définie dans `MAIL_CONTACT` (voir plus bas).

---

## 3. Les variables à configurer en production

À renseigner dans le **panel Infomaniak → variables d'environnement** (ou le `.env` de prod).
Modèle de référence : `backend/.env.production.example`.

### 3.1 Connexion au serveur d'envoi (SMTP)

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `MAIL_HOST` | Adresse du serveur SMTP | `mail.infomaniak.com` |
| `MAIL_PORT` | Port (587 = STARTTLS, standard) | `587` |
| `MAIL_USER` | Identifiant de la boîte d'envoi | `noreply@broderie.ch` |
| `MAIL_PASSWORD` | **Mot de passe de cette boîte** | *(à définir — actuellement `__A_DEFINIR__`)* |

### 3.2 Identité des emails

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `MAIL_FROM` | Expéditeur affiché au client | `"Au Point-Compté <noreply@broderie.ch>"` |
| `MAIL_CONTACT` | Adresse qui **reçoit** les messages du formulaire de contact | `julie@broderie.ch` |

### 3.3 ⚠️ La variable la plus importante : `CLIENT_URL`

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `CLIENT_URL` | Domaine de prod exact — sert à construire **les liens dans les emails** | `https://broderie.ch` |

**Pourquoi c'est critique :** le lien « Confirmer mon adresse » d'un email de vérification est
construit ainsi : `${CLIENT_URL}/verifier-email?token=…`. Idem pour la réinitialisation de mot
de passe. Si `CLIENT_URL` est faux ou resté sur `localhost`, **les clients recevront des liens
cassés** et ne pourront ni confirmer leur email ni réinitialiser leur mot de passe.

---

## 4. ⚠️ Décision à prendre : quel serveur SMTP ?

La boîte `julie@broderie.ch` est hébergée chez **Hetzner** (prestataire tiers), alors que
le modèle de prod pointe vers **Infomaniak**. Il faut trancher avant le go-live.

**Recommandation : ne PAS envoyer les emails automatiques depuis la boîte perso de Julie.**
Créer plutôt une adresse d'envoi dédiée, ex. `noreply@broderie.ch`. Avantages :
- La boîte de Julie n'est pas exposée si un envoi automatique est marqué comme spam.
- Séparation claire entre courrier perso et emails du site.
- Les réponses des clients peuvent quand même arriver à Julie (via `MAIL_CONTACT`).

Deux options concrètes :

| Option | À récupérer |
| --- | --- |
| **SMTP Infomaniak** (recommandé) | Créer `noreply@broderie.ch` chez Infomaniak → host/port/user/pass |
| **SMTP Hetzner** | Demander les paramètres SMTP Hetzner (host/port) + créer la boîte d'envoi |

Dans les deux cas, on met simplement les bonnes valeurs dans `MAIL_HOST/PORT/USER/PASSWORD`.

---

## 5. Tester avant le go-live (indispensable)

Le meilleur test valide toute la chaîne (SMTP + `CLIENT_URL` + délivrabilité) d'un coup :

1. **En staging/prod**, créer un compte de test avec une vraie adresse email à vous.
2. Vérifier que l'**email de vérification arrive** (pensez au dossier spam).
3. **Cliquer le lien** « Confirmer mon adresse » → il doit ouvrir le site (pas localhost) et
   afficher « Adresse confirmée ».
4. Bonus : tester « mot de passe oublié » → le lien de reset doit fonctionner pareil.

Si l'email n'arrive pas → problème SMTP (`MAIL_*`).
Si l'email arrive mais le lien est cassé → problème `CLIENT_URL`.

---

## 6. Bonnes pratiques délivrabilité (pour éviter le dossier spam)

À configurer côté DNS du domaine `broderie.ch` (chez le gestionnaire du domaine) :

- **SPF** : autoriser le serveur SMTP choisi à envoyer pour `broderie.ch`.
- **DKIM** : signer les emails (fourni par Infomaniak/Hetzner selon le choix).
- **DMARC** : politique recommandée pour renforcer la confiance.

Ces enregistrements réduisent fortement le risque que les emails du site tombent en spam.
Le fournisseur SMTP retenu documente les valeurs exactes à ajouter.

---

## Récapitulatif express

| Étape | Action | Bloquant go-live ? |
| --- | --- | --- |
| 1 | Choisir le serveur SMTP (Infomaniak vs Hetzner) + créer `noreply@broderie.ch` | 🔴 Oui |
| 2 | Renseigner `MAIL_HOST/PORT/USER/PASSWORD` en prod | 🔴 Oui |
| 3 | Renseigner `MAIL_FROM`, `MAIL_CONTACT` | 🔴 Oui |
| 4 | Renseigner **`CLIENT_URL`** = domaine de prod | 🔴 Oui — sinon liens email cassés |
| 5 | Configurer SPF / DKIM / DMARC (DNS) | 🟠 Fortement recommandé |
| 6 | Test réel : inscription → email reçu → lien fonctionne | ✅ Avant d'annoncer le site live |

_Le code d'envoi est prêt : seules ces variables et cette décision restent à finaliser._
