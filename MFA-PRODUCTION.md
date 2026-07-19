# Configuration MFA en production — Au Point-Compté

La double authentification (MFA/TOTP) est **obligatoire** pour tout compte `admin`.
Ce document explique ce qu'il faut faire, une seule fois, pour que ça fonctionne sur le VPS Infomaniak.

Contexte technique complet : voir [DEPLOIEMENT.md](DEPLOIEMENT.md). Ce guide-ci ne couvre que la partie MFA.

---

## ⚠️ Point bloquant à connaître avant de déployer

Le serveur backend a maintenant une vérification **fail-fast** au démarrage (`backend/app.js`) : si
`JWT_MFA_PENDING_SECRET` ou `MFA_ENCRYPTION_KEY` sont absentes, ou si `MFA_ENCRYPTION_KEY` ne fait pas
exactement 64 caractères hexadécimaux, **le serveur refuse de démarrer** — y compris avec PM2.

➡️ Si vous faites juste `git pull` + `pm2 reload broderie-api` sur le VPS sans avoir ajouté ces deux
variables dans `backend/.env.production`, **l'API tombera et ne redémarrera pas**. Suivez les étapes
ci-dessous avant de redéployer.

---

## 1. Générer les deux secrets

Sur votre machine locale (pas besoin d'être sur le VPS) :

```bash
# Clé de chiffrement du secret TOTP — AES-256-GCM, doit faire EXACTEMENT 64 caractères hex
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Secret JWT pour le token intermédiaire "MFA en attente"
openssl rand -base64 64
```

Copiez les deux valeurs générées quelque part de sûr (gestionnaire de mots de passe) — vous allez les
coller dans `backend/.env.production` à l'étape suivante.

**Règles impératives :**
- `MFA_ENCRYPTION_KEY` doit faire exactement 64 caractères hexadécimaux (32 bytes). La commande
  `crypto.randomBytes(32).toString('hex')` produit toujours ce format — ne la modifiez pas à la main.
- `JWT_MFA_PENDING_SECRET` doit être **différent** de `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET`.
  C'est ce qui garantit qu'un token MFA-en-attente ne peut jamais servir de vrai access token
  (sécurité anti-bypass — voir `backend/middlewares/mfaPending.js`).
- Ne réutilisez jamais un secret déjà utilisé ailleurs (dev, staging).

---

## 2. Ajouter les variables dans `.env.production` sur le VPS

```bash
ssh debian@179.237.87.29     # ou l'utilisateur fourni par Infomaniak
nano ~/broderie/backend/.env.production
```

Ajoutez ce bloc (n'importe où dans le fichier, par exemple juste après le bloc `JWT_ACCESS_SECRET`/
`JWT_REFRESH_SECRET` existant) :

```ini
# ── MFA (TOTP) — obligatoire pour le rôle admin ─────────────────────────────
JWT_MFA_PENDING_SECRET=<collez le secret openssl généré à l'étape 1>
JWT_MFA_PENDING_EXPIRES_IN=5m
MFA_ENCRYPTION_KEY=<collez la clé hex de 64 caractères générée à l'étape 1>
MFA_RECOVERY_CODES_COUNT=10
```

Sauvegardez (`Ctrl+O`, `Entrée`, `Ctrl+X` dans nano).

> Le fichier `backend/.env.production.example` (committé, sans secrets) contient déjà ce bloc comme
> modèle — utile si vous repartez d'un `.env.production` vide sur un nouveau serveur.

---

## 3. Exécuter la migration MySQL

La MFA a besoin de deux nouvelles tables (`user_mfa`, `user_mfa_recovery_codes`). Comme toute migration
du projet, elle s'exécute une seule fois, dans l'ordre :

```bash
cd ~/broderie/database
sudo mysql broderie < migrations/011_add_mfa.sql
```

Vérification que les tables existent bien :

```bash
sudo mysql broderie -e "SHOW TABLES LIKE 'user_mfa%';"
# Doit afficher : user_mfa
#                 user_mfa_recovery_codes
```

> Si vous déployez sur un **nouveau serveur** (base neuve, jamais migrée), inutile de lancer cette
> migration séparément : `schema.sql` contient déjà les deux tables — l'import initial (`mysql broderie
> < schema.sql`) les crée directement. Ne relancez `011_add_mfa.sql` que sur une base **déjà en place**
> qui ne les a pas encore.

---

## 4. Redémarrer l'API

```bash
cd ~/broderie
pm2 reload broderie-api
pm2 logs broderie-api --lines 30
```

Vérifiez dans les logs :
- **Pas** de ligne `[ERREUR DÉMARRAGE] Variables d'environnement manquantes` ni
  `MFA_ENCRYPTION_KEY doit être une chaîne hexadécimale...`
- La ligne `✓  MFA            /api/v1/mfa` doit apparaître dans le tableau des routes montées.

Si le serveur ne redémarre pas ou boucle en crash (`pm2 status` affiche `errored`), c'est presque
toujours que l'étape 2 a été oubliée ou qu'une des deux valeurs contient un caractère invisible copié
par erreur (espace, retour à la ligne) — régénérez proprement et recollez.

---

## 5. Premier login admin après déploiement

**Tous les comptes `admin` existants devront configurer leur MFA au prochain login** —
c'est le comportement voulu, il n'y a rien à faire de spécial côté serveur pour ça.

Déroulé pour chaque admin (à communiquer à Julie et aux autres comptes admin) :

1. Se connecter normalement sur `/admin/connexion` (email + mot de passe habituels).
2. Le site redirige automatiquement vers un écran de configuration : un QR code s'affiche.
3. Scanner ce QR code avec une application d'authentification sur son téléphone — Google
   Authenticator, Authy, ou 1Password conviennent tous. Le site propose aussi la saisie manuelle
   d'une clé si le QR ne scanne pas.
4. Saisir le code à 6 chiffres affiché par l'application pour confirmer.
5. **10 codes de récupération s'affichent une seule fois** — l'admin doit les copier ou les
   télécharger et les conserver dans un endroit sûr (gestionnaire de mots de passe, coffre-fort
   numérique). Ces codes permettent de se reconnecter si le téléphone est perdu. Une fois l'écran
   fermé, ils ne sont plus jamais récupérables via l'interface.
6. Ensuite, à chaque connexion, un code à 6 chiffres sera demandé en plus du mot de passe.

---

## 6. Que faire si un admin perd son téléphone

**Cas 1 — il lui reste au moins un code de récupération** : sur l'écran de vérification MFA, il clique
sur « Utiliser un code de récupération » et saisit l'un des 10 codes reçus au setup. Chaque code n'est
utilisable qu'une seule fois. Il peut ensuite régénérer un nouveau jeu de 10 codes depuis
**Paramètres → Sécurité** dans le back-office, une fois reconnecté.

**Cas 2 — il n'a plus aucun code de récupération** (téléphone perdu ET codes égarés) : il n'y a plus de
reset depuis le back-office (rôle `super_admin` supprimé). Supaco Digital intervient directement en base
sur le VPS :

```bash
sudo mysql broderie -e "DELETE FROM user_mfa WHERE user_id = <id>;"
```

(`ON DELETE CASCADE` nettoie aussi `user_mfa_recovery_codes`.) Le compte reconfigure sa MFA depuis zéro
à sa prochaine connexion (retour à l'étape 5).

---

## Checklist rapide

- [ ] `JWT_MFA_PENDING_SECRET` généré (`openssl rand -base64 64`) et ajouté dans `.env.production`
- [ ] `MFA_ENCRYPTION_KEY` généré (`crypto.randomBytes(32).toString('hex')`, 64 caractères) et ajouté
- [ ] Les deux secrets sont différents entre eux et de `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
- [ ] Migration `011_add_mfa.sql` exécutée (ou tables déjà présentes via `schema.sql` sur base neuve)
- [ ] `pm2 reload broderie-api` sans erreur, ligne `✓ MFA /api/v1/mfa` visible dans les logs
- [ ] Testé : un compte admin existant redirige bien vers la configuration MFA à son prochain login
- [ ] Julie (et tout autre admin) informée du déroulé du setup (§5) et de la conservation des codes
      de récupération

---

*Supaco Digital — Au Point-Compté — 2026*
