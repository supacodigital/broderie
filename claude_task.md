# claude_task.md — Ce qu'il reste à faire

**Projet : Au Point-Compté** — E-commerce broderie 🇨🇭
**Généré le : 18 juin 2026**
Stack : React + Vite + CSS Modules | Node.js + Express | MySQL | Infomaniak

> Ce fichier est l'inventaire **actionnable** du reste à faire, vérifié sur le code réel
> (et non sur la mémoire). Pour le détail fonctionnel de ce qui est déjà livré, voir
> [ETAT_PROJET.md](ETAT_PROJET.md). Pour l'hébergement, voir [HEBERGEMENT.md](HEBERGEMENT.md).

---

## 🟢 État vérifié au 18 juin 2026

| Domaine | État | Vérifié |
|---|---|---|
| Backend API (routes → controllers → services → repositories) | ✅ Complet | code présent |
| Fonctionnalités RDV juin (sur commande, 4 paiements, retrait) | ✅ Livré & committé | migrations 006/007/008 + commit `64aa6209` |
| Boutique client + back-office admin | ✅ Complet | code présent |
| Migrations BDD | ✅ 8 migrations (001 → 008) | [database/migrations/](database/migrations/) |
| i18n FR / DE / EN | ✅ 292 clés par locale (à jour) | `common.json` identiques en nb de clés |
| Tests (unit + intégration) | ✅ **682 verts / 682 (54 suites)** — vérifié 18 juin | `npm test` avec MySQL up |
| E2E Playwright | ✅ 7 specs présentes | [e2e/tests/](e2e/tests/) |
| Déploiement Infomaniak | ❌ Non démarré | — |
| Migration 1800 clients | ❌ En attente fichier client | — |
| Config prod facture QR / retrait | ✅ IBAN réel + adresse + horaires dans `.env` | reste clés Stripe live |

---

## ✅ Tests — tout vert (vérifié 18 juin 2026)

`cd backend && npm test` → **692 tests verts / 692 (56 suites)**, ~17 s.

> Les 69 « rouges » observés au premier passage venaient **uniquement** de l'absence de
> MySQL sur le port **8889** (MAMP éteint) — pas d'une régression. MySQL relancé →
> base `broderie` (28 tables, 428 users, 203 produits) → tout passe.

**À savoir** : les tests d'intégration tournent **directement sur la base `broderie`**
du `.env` (pas une base de test dédiée). Prérequis pour les relancer :
- [ ] MySQL (MAMP) démarré sur `127.0.0.1:8889`, base `broderie` présente et peuplée
- Bruit bénin dans les logs : Mailtrap `550 Too many emails per second` (limite de plan,
  envoi d'email non bloquant — aucun test n'en dépend).

---

## 🔴 Avant mise en production — OBLIGATOIRE

### 1. Hébergement Infomaniak — services commandés ✅
> Guide de déploiement complet : [DEPLOIEMENT_INFOMANIAK.md](DEPLOIEMENT_INFOMANIAK.md)
> (mono-domaine + Nginx). Config PM2 : [ecosystem.config.js](ecosystem.config.js).
- [x] **VPS Cloud** « Au point Compté » (`ov-f7c30d`, Ubuntu 26.04 LTS) — commandé
- [x] **Swiss Backup** (`BK-1676312-1`, 200 Go) — commandé (pour sauvegardes BDD + uploads/)
- [x] **Stockage images** : tranché → **disque du VPS** (pas d'Object Storage), `config/storage.js` adapté
- [ ] Ajouter l'alias email `noreply@broderie.ch` (le domaine et `julie@broderie.ch` existent déjà)
- [ ] Suivre le guide : installer stack, MySQL + migrations, builds, PM2, Nginx + SSL Let's Encrypt
- [x] **Fixes prod faits** : `trust proxy` (cookies Secure derrière Nginx), chargement `.env.production`

### 2. Déploiement
- [ ] Exécuter `database/schema.sql` **puis les 8 migrations** (`001` → `008`) sur la base de prod
- [ ] Renseigner les variables d'env de prod (voir section dédiée plus bas)
- [ ] Configurer PM2 ou le gestionnaire de process Infomaniak
- [ ] CORS = domaine de prod exact (pas de wildcard `*`)
- [ ] `npm run build` frontend **et** admin → déployer les `dist/`
- [ ] Forcer HTTPS

### 3. Config paiements & retrait — remplacer les placeholders de test
> ⚠️ Oublier ces valeurs = factures avec mauvais IBAN + mauvais lieu de retrait.
- [x] ✅ **`QR_INVOICE_IBAN`** — **FAIT** : IBAN PostFinance réel de Julie renseigné dans `.env`
      (depuis sa carte bancaire). Validé (clé mod-97 OK, institut 09000, IBAN normal) et
      facture QR générée avec succès par `swissqrbill`. À reporter dans `.env.production`.
- [x] **`QR_INVOICE_*`** (nom, adresse, NPA, ville) — ✅ adresse réelle renseignée dans `.env`
      (Au Point-Compté, Rue de Vuarrengel 10, 1418 Vuarrens) — 18 juin.
- [x] **`PICKUP_*`** (adresse, NPA, ville, horaires) — ✅ renseigné dans `.env` :
      Vuarrens + horaires **Mardi–Samedi 9h–12h et 13h30–18h30**.
- [x] **`INVOICE_DUE_DAYS`** — 30 j confirmé dans `.env`

### 4. Stripe production
- [ ] Compte Stripe en mode production
- [ ] `sk_test_...` → `sk_live_...` (backend) et `pk_test_...` → `pk_live_...` (frontend)
- [ ] Webhook prod : `https://broderie.ch/api/v1/payments/webhook` + vrai `whsec_...`
- [ ] Activer **Twint** dans le dashboard Stripe (nécessite compte bancaire suisse)
- [ ] Test paiement carte réel (petit montant) + test redirect Twint réel

### 5. Emails production
- [ ] Remplacer les credentials Mailtrap par le SMTP **Infomaniak Mail** (`noreply@broderie.ch`)
- [ ] Vérifier réception réelle : confirmation commande, reset password, facture QR, « prête pour le retrait »

### 6. La Poste CH — étiquettes (API directe, accès réels)
> Voie retenue : **API directe La Poste CH** — **Digital Commerce API** (OAuth2, `dcapi.apis.post.ch`) — pas ShipEngine.
> Code **désormais branché sur l'API réelle** avec **repli automatique sur le mock** :
> tant que `SWISS_POST_CLIENT_ID` est vide/`change_me`, `config/swissPost.js` reste en mode mock.
> Endpoints (dans `config/env.js`) : token `https://api.post.ch/OAuth/token` (scope `DCAPI_BARCODE_READ`),
> label `https://dcapi.apis.post.ch/barcode/v1/generateAddressLabel`.

**A. Côté cliente (Julie) — accès — ✅ PARTIELLEMENT FAIT (18 juin) :**
- [x] **Numéros de contrat** trouvés dans « Ma Poste » → débiteur / licence d'affranchissement
      = **`40143484`** (sert pour `KUNDENNUMMER` ET `FRANKIERNUMMER`). Vu aussi comme
      « Debtor number » sur l'app developer.post.ch.
- [x] **Compte développeur + application** : l'app **« Broderie »** existe déjà sur
      developer.post.ch (créée 12 mai 2026, owner Julie Guerle, statut ACTIVE).
- [x] **Subscription au produit « Barcode »** (plan Standard, OAuth2) **créée le 18.06.2026**
      → ⏳ statut **PENDING** (approbation Swiss Post requise, ~3 jours ouvrés annoncés).
      ID subscription : `bc00172e-a31f-41c3-8017-2ea31fe1c395`.
- [ ] ⏳ **`CLIENT_ID` / `CLIENT_SECRET`** (Consumer Key/Secret) : **non visibles tant que la
      subscription est PENDING** — apparaîtront sur My Applications → Broderie **après approbation**.
      Pour accélérer : bouton « Get help » du portail ou mail à `digitalintegration@swisspost.ch`
      (citer app « Broderie », débiteur `40143484`, subscription Barcode du 18.06.2026).

**B. Côté config — ✅ PARTIELLEMENT FAIT :**
- [x] `SWISS_POST_KUNDENNUMMER=40143484` et `SWISS_POST_FRANKIERNUMMER=40143484` **dans `backend/.env`** (local)
- [ ] `SWISS_POST_CLIENT_ID` / `SWISS_POST_CLIENT_SECRET` → à coller après approbation
      (décommenter dans `.env`) → bascule automatique hors du mode mock, aucun code à changer.
- [ ] Reporter les 4 valeurs dans `.env.production` le moment venu.

**C. Côté dev — ✅ FAIT (le 18 juin) :**
- [x] Client OAuth2 client_credentials avec cache du token (`config/swissPostClient.js`)
- [x] Appel réel `generateAddressLabel` + parsing `identCode` / PDF base64 (`shipping.service.js`)
- [x] `downloadLabel` sert le PDF réel (data URI base64) ([admin/shipping.controller.js](backend/controllers/admin/shipping.controller.js))
- [x] Tests mode réel + client OAuth2 (10 tests, fetch mocké) — suite à **692 verts**

**C-bis. À faire le jour de l'activation (quand les clés arrivent) :**
- [ ] **Valider le détail du body contre le Swagger officiel** (developer.post.ch → Barcode → OpenAPI) :
      les sous-champs `item/recipient/attributes` (codes produit `przl`, layout, résolution)
      sont posés d'après la doc publique mais à confirmer — voir note dans `config/swissPostClient.js`.
- [ ] Brancher le **suivi réel** `getTrackingByLabelId` (endpoint de tracking distinct, scope/URL à confirmer)
- [ ] Tester une étiquette réelle depuis l'admin + valider le tracking sur Post.ch

### 7. Migration 1800 clients
- [ ] Recevoir le CSV / dump SQL de l'ancien site
- [ ] Adapter `database/migrate_customers.js` aux colonnes reçues
- [ ] Tester la migration sur **staging** (base séparée) — jamais directement en prod
- [ ] Vérifier que l'email de réinitialisation est bien reçu par un compte migré test
- [ ] Exécuter `POST /api/v1/admin/migrations/customers` (super_admin) une fois validé

---

## 🟢 Audit complet du 18 juin 2026 — corrections appliquées

Audit multi-agents (sécurité, perf, conformité CH, frontend) + vérifications manuelles.
**700 tests verts.** Corrections committées :

- [x] **🔴 Bug LPD** : `consent.routes.js` utilisait `db.query()` (inexistant) → le consentement
      cookies n'était jamais enregistré (erreur avalée). Corrigé → `pool.execute`.
- [x] **🟠 Vuln Multer (DoS, high)** : 2.1.1 → 2.2.0.
- [x] **🟡 Locale figée en `'fr'`** dans panier + commande → propagée (compte > ?locale >
      Accept-Language). Les clients DE/EN voient enfin les noms produits dans leur langue ;
      le snapshot de commande fige le nom dans la langue d'achat. Helper `localeFromRequest` + 8 tests.
- [x] **`SELECT` sans LIMIT** (commandes client en admin) → `LIMIT 100`.
- [x] **i18n textes FR durs** : Product, Checkout, Account entièrement traduits FR/DE/EN
      (366 clés à parité). Schémas Zod d'Account → factories `(t)` mémoïsées.
- [x] **srcset images** : le détail renvoie `url_medium/url_large` (srcset enfin alimenté) ;
      vignettes catalogue servies en medium (600px) au lieu de large (1200px).

**Décisions assumées (non bloquantes) :**
- **Admin FR-only** : back-office utilisé par Julie/le dev (francophones) → pas de traduction
  prévue. Acceptable, documenté comme choix.
- **i18n boutique** : front client 100% FR/DE/EN, dialecte DE-CH vérifié (0 `ß`, « ss »).

**Reste (mineur, non bloquant) :**
- [ ] 1 vuln npm modérée (uuid) — nécessite un breaking change `uuid@14`, à planifier hors veille de déploiement.
- [ ] Validation Zod incomplète sur quelques routes admin (données déjà protégées en SQL — robustesse, pas sécurité).

### SEO — ✅ FAIT (18 juin)
- [x] Composant `<Seo>` (react-helmet-async) — `<title>` + `<meta description>` **dynamiques par page**
      ([frontend/src/components/seo/Seo.jsx](frontend/src/components/seo/Seo.jsx)), traduits FR/DE/EN (namespace `seo`)
- [x] Intégré sur Home, Catalogue, Product (titre/desc/image = produit), Notre histoire, Contact
- [x] `hreflang` `fr-CH`/`de-CH`/`en` + `x-default` + `canonical` dynamiques par page ; `<html lang>` synchronisé
- [x] `sitemap.xml` + `robots.txt` ([frontend/public/](frontend/public/)) — privées en `Disallow`/`noindex`
- [ ] **Reste** : URL de prod confirmée (`VITE_SITE_URL`) + **soumettre le sitemap à Google Search Console** (post-déploiement)
- [ ] **Amélioration future** : sitemap **dynamique** des produits/catégories (génération serveur — actuellement pages statiques seulement)

### Performance (checklist CLAUDE.md)
- [ ] Audit bundle `vite-bundle-visualizer` (client + admin séparés)
- [ ] Lighthouse ≥ 90 mobile **et** desktop sur l'URL de prod
- [ ] `EXPLAIN` sur les requêtes fréquentes — confirmer l'usage des index
- [ ] Après import produits : `ANALYZE TABLE products; ANALYZE TABLE product_translations;`

### Tests complémentaires
- [ ] Faire tourner les E2E Playwright contre staging (les 3 flux critiques)
- [ ] Augmenter la couverture `email.service.js` / `payment.service.js`

---

## 📋 Variables d'environnement prod — à créer (jamais committer)

`backend/.env.production` — clés notables (liste complète dans `backend/.env.example`) :

```env
NODE_ENV=production
CLIENT_URL=https://broderie.ch
ADMIN_URL=https://broderie.ch/admin

# Base de données (VPS Infomaniak)
DB_HOST=...   DB_NAME=...   DB_USER=...   DB_PASSWORD=...

# JWT — secrets forts (openssl rand -base64 64)
JWT_ACCESS_SECRET=...   JWT_REFRESH_SECRET=...

# Stripe live
STRIPE_SECRET_KEY=sk_live_...   STRIPE_WEBHOOK_SECRET=whsec_...

# Facture QR suisse — ⚠️ VRAI IBAN
QR_INVOICE_IBAN=...   QR_INVOICE_NAME=...   QR_INVOICE_ADDRESS=...
QR_INVOICE_ZIP=...    QR_INVOICE_CITY=...   INVOICE_DUE_DAYS=30

# Click & Collect — ⚠️ VRAIE boutique
PICKUP_NAME=...  PICKUP_ADDRESS=...  PICKUP_ZIP=...  PICKUP_CITY=...  PICKUP_HOURS=...

# Emails Infomaniak Mail
MAIL_HOST=mail.infomaniak.com  MAIL_PORT=587  MAIL_USER=noreply@broderie.ch  MAIL_PASSWORD=...

# La Poste CH — API directe (OAuth2)
SWISS_POST_CLIENT_ID=...   SWISS_POST_CLIENT_SECRET=...
SWISS_POST_KUNDENNUMMER=...   SWISS_POST_FRANKIERNUMMER=...

# Google OAuth (ajouter https://broderie.ch aux origines autorisées)
GOOGLE_CLIENT_ID=...

# Infomaniak Object Storage
STORAGE_ENDPOINT=https://s3.pub1.infomaniak.cloud  STORAGE_BUCKET=...
STORAGE_ACCESS_KEY=...   STORAGE_SECRET_KEY=...
```

`frontend/.env.production` :
```env
VITE_STRIPE_PUBLIC_KEY=pk_live_...
VITE_GOOGLE_CLIENT_ID=<même client ID que le backend>
```

---

## 🎯 Prochaine action recommandée

1. ✅ ~~Vérifier les tests~~ — fait le 18 juin : **682/682 verts**.
2. **Commander les 2 services Infomaniak** (VPS + Object Storage) — c'est le vrai chemin critique.
3. **Réclamer au client** : vrai IBAN, adresse/horaires boutique, accès Swiss Post, fichier des 1800 clients.

---

*Supaco Digital — Au Point-Compté — 2026*
