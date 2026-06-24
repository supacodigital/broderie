# Hébergement & Déploiement — Au Point-Compté

**Hébergeur : Infomaniak (Genève 🇨🇭) — conforme LPD nativement**
**Dernière mise à jour : 3 juin 2026**

> Ce document fait l'inventaire de ce dont dispose la cliente sur son compte Infomaniak,
> et liste précisément **ce qu'il reste à commander et configurer** pour mettre le site en ligne.

---

## 1. État actuel du compte Infomaniak

| Élément | Statut | Remarque |
|---|---|---|
| **Nom de domaine** (`broderie.ch`) | ✅ Disponible | Déjà acquis |
| Email pro (`julie@broderie.ch`) | ✅ Disponible | Existe déjà — reste à ajouter un alias `noreply@` |
| Certificat SSL | ⏳ Inclus | Let's Encrypt gratuit, à activer une fois le serveur prêt |
| Hébergement serveur (VPS / Cloud) | ❌ À commander | Nécessaire pour faire tourner l'API Node.js |
| Base de données MySQL | ❌ À commander | Managed Database recommandé |
| Object Storage (médias / images) | ❌ À commander | Pour les images produits WebP (uploads Multer) |

> ⚠️ **Conclusion : la cliente dispose déjà du domaine et d'une adresse email pro (`julie@broderie.ch`).**
> Pour le **lancement**, on part sur **2 services à commander** seulement (cf. arbitrage ci-dessous) :
>
> 1. **VPS Cloud** — le serveur qui fait tourner l'application **+ MySQL installé dessus**
> 2. **Object Storage** — le stockage des images produits
>
> (Pour les emails, il suffit d'ajouter un alias `noreply@broderie.ch` — pas de nouvelle commande.)
>
> 📌 **Choix retenu pour le démarrage : Option A — MySQL installé directement sur le VPS**
> (pas de Managed Database au lancement → économie d'environ CHF 44/mois). On pourra
> migrer vers une base managée plus tard si le besoin de robustesse/backups l'exige.

---

## 2. Ce qu'il faut commander chez Infomaniak

Architecture cible retenue :

```
                    ┌─────────────────────────┐
   broderie.ch ───▶ │   VPS Cloud (Linux)      │
   (DNS Infomaniak) │   - Node.js ≥ 20 LTS     │
                    │   - Express API (PM2)    │
                    │   - Nginx (reverse proxy)│
                    │   - dist/ frontend+admin │
                    │   - MySQL (sur le VPS) ◀─┼── Option A : base installée ici
                    └───────────┬──────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
            ┌───────────────┐         ┌──────────────┐
            │ Object Storage│         │ Infomaniak   │
            │ (images WebP) │         │ Mail SMTP    │
            └───────────────┘         └──────────────┘
```

### 2.1 — Serveur d'application : VPS Cloud ✅ (choix retenu)

- **Produit Infomaniak** : *VPS Cloud* (serveur Linux avec accès SSH root)
- **Pourquoi** : contrôle total sur Node.js, PM2, Nginx — idéal pour une API Express
- **OS recommandé** : Ubuntu 24.04 LTS (Node.js ≥ 20 facilement disponible)
- **Dimensionnement suggéré** (volumes du projet : ~14 000 produits, ~2 000 clients) :

| Profil | vCPU | RAM | Disque | Usage |
|---|---|---|---|---|
| Démarrage | 2 | 4 Go | 80 Go SSD | Lancement, trafic modéré |
| Recommandé | 4 | 8 Go | 160 Go SSD | Confort prod + marge migration 1800 clients |

> 💡 On peut démarrer sur le profil bas et upgrader le VPS sans réinstaller (Infomaniak redimensionne à chaud).

### 2.2 — Base de données : MySQL installé sur le VPS ✅ (Option A — choix de lancement)

- **Pas de produit séparé à commander** : MySQL (logiciel libre) est installé directement sur le VPS
- **Pourquoi ce choix au démarrage** : pas de coût supplémentaire (~CHF 44/mois économisés), suffisant pour le lancement
- **À installer / configurer sur le VPS** :
  - MySQL ≥ 8 (`apt install mysql-server`)
  - 1 base **production** (`broderie_prod`)
  - 1 base **staging** (`broderie_staging`) — séparée, jamais les mêmes credentials
  - 1 utilisateur MySQL dédié par base, **privilèges limités** (pas de root applicatif)
  - MySQL en écoute sur `localhost` uniquement (jamais exposé sur Internet)
- **Config pool attendue côté app** (déjà dans le code, cf. `config/db.js`) : min 5 / max 20 connexions, Keep-Alive activé
- **DB_HOST** = `localhost` ou `127.0.0.1` dans `.env.production`

> ⚠️ **Responsabilité accrue (Option A)** : les **sauvegardes ne sont pas automatiques**.
> Mettre en place un **backup quotidien** de la base (cf. section 8 — Sauvegardes).
>
> 🔄 **Évolution future** : si le besoin de robustesse augmente (haute dispo, backups managés),
> on pourra migrer vers une **Managed Database Infomaniak** (~CHF 44/mois) sans changer le code —
> il suffira de modifier `DB_HOST`, `DB_USER`, `DB_PASSWORD` dans `.env.production`.

### 2.3 — Stockage des médias : Object Storage (S3)

- **Produit Infomaniak** : *Public Cloud — Object Storage* (compatible S3, Swiss Made)
- **Pourquoi** : les images produits (WebP × 3 tailles via `sharp`) ne doivent **jamais** être sur le disque local en production
- **À créer** : un bucket `broderie-media`
- **Variables fournies par Infomaniak** : endpoint S3, access key, secret key, nom du bucket

### 2.4 — Emails transactionnels : Infomaniak Mail ✅ (déjà en place)

- **Produit Infomaniak** : *Service Mail* — **déjà actif**, la cliente a `julie@broderie.ch`
- **À ajouter** (alias / boîtes sur le service existant, pas de nouvelle commande) :
  - `noreply@broderie.ch` → expéditeur des emails transactionnels (Nodemailer SMTP)
  - `contact@broderie.ch` → adresse de contact / support (peut être un alias vers `julie@`)
- **SMTP Infomaniak** : `mail.infomaniak.com`, port `587` (STARTTLS)

### 2.5 — SSL / HTTPS

- **Let's Encrypt** gratuit via le panel Infomaniak — à activer une fois le VPS configuré et le domaine pointé
- **HTTPS forcé** obligatoire (redirection 301 du `http://` vers `https://`)

---

## 3. Configuration DNS du domaine

Le domaine `broderie.ch` est déjà chez Infomaniak — il suffit de faire pointer les
enregistrements DNS vers le VPS une fois celui-ci provisionné.

| Type | Nom | Valeur | Rôle |
|---|---|---|---|
| `A` | `@` | `<IP publique du VPS>` | Domaine racine → serveur |
| `A` | `www` | `<IP publique du VPS>` | Sous-domaine www |
| `A` | `staging` | `<IP du VPS staging ou même VPS>` | Environnement de recette |
| `MX` | `@` | (laisser les MX Infomaniak Mail) | Réception emails |
| `TXT` | `@` | SPF Infomaniak | Délivrabilité emails |
| `TXT` | `_dmarc` | Politique DMARC | Anti-spoofing emails |

> 📌 Penser aussi à configurer **SPF / DKIM / DMARC** pour que les emails
> transactionnels (`noreply@broderie.ch`) ne tombent pas en spam.

---

## 4. Étapes de mise en ligne (ordre recommandé)

### Phase A — Commander & provisionner
- [ ] Commander le **VPS Cloud** (Ubuntu 24.04 LTS)
- [ ] Commander l'**Object Storage** + créer le bucket `broderie-media`
- [ ] Ajouter l'alias `noreply@broderie.ch` sur le service Mail existant (`julie@` déjà actif)
- [ ] Noter tous les credentials fournis (IP du VPS, clés S3)
> 💡 Option A : pas de base à commander — MySQL sera installé sur le VPS (Phase C).

### Phase B — Préparer le serveur (VPS)
- [ ] Connexion SSH, créer un utilisateur non-root + clé SSH
- [ ] Installer Node.js ≥ 20 LTS, PM2, Nginx
- [ ] Installer **MySQL ≥ 8** (`apt install mysql-server`) + `mysql_secure_installation`
- [ ] Configurer le pare-feu (ufw) : autoriser 22 (SSH), 80, 443 uniquement — **jamais le port 3306**
- [ ] Installer le certificat SSL Let's Encrypt (certbot ou panel Infomaniak)
- [ ] Configurer Nginx en reverse proxy → `localhost:3000` (API) + service des `dist/`

### Phase C — Base de données (MySQL sur le VPS)
- [ ] Vérifier que MySQL écoute uniquement sur `localhost` (`bind-address = 127.0.0.1`)
- [ ] Créer les bases `broderie_prod` et `broderie_staging`
- [ ] Créer un utilisateur MySQL dédié par base (privilèges limités, pas de root)
- [ ] Exécuter `database/schema.sql` sur chaque base
- [ ] Mettre en place le **backup quotidien automatique** (cf. section 8)

### Phase D — Déployer l'application
- [ ] Cloner le repo sur le VPS (ou pipeline de déploiement)
- [ ] Créer `backend/.env.production` (cf. section 5) — **jamais commité**
- [ ] `npm ci` backend
- [ ] `npm run build` frontend → déployer `dist/`
- [ ] `npm run build` admin → déployer `dist/admin`
- [ ] Lancer l'API avec PM2 (`pm2 start app.js --name broderie-api`)
- [ ] `pm2 save` + `pm2 startup` (redémarrage auto au boot)

### Phase E — Services tiers en production
- [ ] **Stripe** : passer en mode live, configurer le webhook `https://broderie.ch/api/v1/payments/webhook`, activer Twint
- [ ] **Google OAuth** : ajouter `https://broderie.ch` aux origines autorisées
- [ ] **La Poste CH** : renseigner les accès API d'expédition réels (cf. claude_task.md)
- [ ] **Emails** : tester l'envoi réel depuis la prod

### Phase F — Staging & migration
- [ ] Déployer l'environnement de **staging** (`staging.broderie.ch`)
- [ ] Tester la **migration des 1800 clients** sur staging (jamais en prod directement)
- [ ] Valider le tunnel d'achat complet sur staging avec la cliente

### Phase G — Mise en production
- [ ] Faire pointer le DNS `broderie.ch` vers le VPS
- [ ] Forcer HTTPS, vérifier le certificat SSL
- [ ] Vérifier que le **backup quotidien MySQL** tourne (cf. section 8) avant le go-live
- [ ] Exécuter la migration des 1800 clients en production
- [ ] Vérifier Lighthouse ≥ 90, monitoring des requêtes > 200ms

---

## 5. Variables d'environnement de production

> Récapitulatif des credentials à récupérer depuis Infomaniak et les services tiers.
> Fichier `backend/.env.production` — **ne jamais committer**, tenir à jour un `.env.example`.

```env
NODE_ENV=production
PORT=3000

# Domaines
CLIENT_URL=https://broderie.ch
ADMIN_URL=https://broderie.ch/admin

# Base de données — MySQL installé sur le VPS (Option A)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=broderie_prod
DB_USER=<utilisateur dédié>
DB_PASSWORD=<mot de passe>

# JWT — générer : openssl rand -base64 64
JWT_ACCESS_SECRET=<secret fort>
JWT_REFRESH_SECRET=<secret fort>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Stripe production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Emails — Infomaniak Mail
MAIL_HOST=mail.infomaniak.com
MAIL_PORT=587
MAIL_USER=noreply@broderie.ch
MAIL_PASSWORD=<mot de passe email>
MAIL_FROM=Au Point-Compté <noreply@broderie.ch>
MAIL_CONTACT=contact@broderie.ch

# Google OAuth
GOOGLE_CLIENT_ID=<client ID Google Cloud Console>

# La Poste CH — accès API expédition
SWISS_POST_CLIENT_ID=<client ID La Poste CH>
SWISS_POST_CLIENT_SECRET=<client secret La Poste CH>
SWISS_POST_KUNDENNUMMER=<numéro client La Poste>
SWISS_POST_FRANKIERNUMMER=<numéro affranchissement>

# Object Storage — Infomaniak Public Cloud (S3)
STORAGE_ENDPOINT=https://s3.pub1.infomaniak.cloud
STORAGE_BUCKET=broderie-media
STORAGE_ACCESS_KEY=<clé accès>
STORAGE_SECRET_KEY=<clé secrète>
```

Fichier `frontend/.env.production` :

```env
VITE_STRIPE_PUBLIC_KEY=pk_live_...
VITE_GOOGLE_CLIENT_ID=<même client ID que le backend>
```

---

## 6. Récapitulatif des coûts (Option A — choix de lancement)

| Service | Produit Infomaniak | Coût |
|---|---|---|
| Nom de domaine | `.ch` | ✅ déjà payé (~CHF 10/an) |
| Emails | Service Mail | ✅ déjà actif (`julie@broderie.ch`) |
| SSL | Let's Encrypt | ✅ gratuit |
| **Serveur app + MySQL** | VPS Cloud M (2 vCPU, 4 Go) | **~17 CHF/mois** (18 €) |
| **Serveur app + MySQL** | VPS Cloud L (4 vCPU, 8 Go) | **~34 CHF/mois** (36 €) |
| Base de données | MySQL installé sur le VPS | ✅ **gratuit** (inclus dans le VPS) |
| Stockage médias | Object Storage | **~0.05 CHF/mois** (0.01 €/Go, ~5 Go) |

> **Total mensuel estimé (Option A) : entre ~17 et ~34 CHF/mois** selon la taille du VPS.
> Conversion EUR→CHF ≈ 0.95. Montants à confirmer dans le panel Infomaniak (offres/promos 2026).
>
> 💡 **Si évolution vers Managed Database plus tard** : +~CHF 44/mois → total ~61 à 78 CHF/mois.

**Sources tarifs :** [VPS Cloud](https://www.infomaniak.com/en/hosting/vps-cloud/prices) ·
[Object Storage](https://pcr.cloud-mercato.com/providers/infomaniak/object-storage/infomaniak-os/pricing) ·
[Managed Database](https://www.infomaniak.com/en/hosting/public-cloud/database)

---

## 7. Points d'attention (rappel CLAUDE.md)

- **Données en Suisse** : Infomaniak (Genève) → conformité LPD native
- **CORS** : origin = `https://broderie.ch` exact — jamais de wildcard `*`
- **Node.js ≥ 20 LTS** : confirmer la version exacte disponible avant de démarrer
- **Médias** : toujours sur l'Object Storage, jamais le disque local en prod
- **Staging obligatoire** : tester la migration des 1800 clients avant la prod
- **Backup MySQL** : en Option A, **non automatique** — à mettre en place manuellement (cf. section 8)
- **Credentials distincts** staging / production — jamais partagés
- **Port 3306 jamais exposé** : MySQL en écoute sur `localhost` uniquement

---

## 8. Sauvegardes MySQL (spécifique Option A)

> ⚠️ Contrairement à une base managée, **MySQL sur le VPS n'a pas de backup automatique**.
> C'est **le point de vigilance n°1** de l'Option A — à mettre en place dès le déploiement.

**Mise en place d'un backup quotidien automatique :**

- [ ] Script `mysqldump` quotidien (cron) vers un dossier local
- [ ] **Copier les dumps vers l'Object Storage** (hors du VPS — si le serveur meurt, les backups survivent)
- [ ] Rotation : garder 7 jours quotidiens + 4 hebdomadaires
- [ ] Tester une **restauration** au moins une fois avant le go-live

```bash
# Exemple — /etc/cron.daily/backup-mysql.sh (à adapter)
# Sauvegarde quotidienne de la base, puis envoi sur l'Object Storage
DATE=$(date +%F)
mysqldump -u backup_user -p"$DB_PASSWORD" broderie_prod | gzip > /var/backups/broderie_$DATE.sql.gz
# Copie vers l'Object Storage (rclone / aws-cli configuré sur le bucket)
rclone copy /var/backups/broderie_$DATE.sql.gz infomaniak:broderie-media/backups/
# Nettoyage local — garder 7 jours
find /var/backups -name "broderie_*.sql.gz" -mtime +7 -delete
```

> 💡 La sauvegarde **hors du VPS** (vers l'Object Storage) est essentielle : un backup stocké
> uniquement sur le serveur ne protège pas d'une panne disque ou d'une suppression du VPS.

---

*Supaco Digital — Au Point-Compté — Hébergement Infomaniak — 2026*
