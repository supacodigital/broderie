# CLAUDE.md — E-Commerce Full-Stack — Marché Suisse 🇨🇭

Stack : React + Vite + CSS Modules | Node.js + Express | MySQL (raw) | Infomaniak
Marché : **Suisse uniquement** — 1800 clients à migrer depuis l'ancien site

---

## 1. STACK & CONVENTIONS

### Frontend

- **Framework** : React + Vite
- **Styles** : CSS Modules (`.module.css`) — PAS de SCSS, PAS de Tailwind, PAS de styled-components
- **Icônes** : lucide-react uniquement
- **HTTP** : Axios uniquement
- **i18n** : react-i18next — FR par défaut, DE-CH, EN
- **Formulaires** : React Hook Form + Zod
- **Routing** : React Router v6
- **State global** : Context API — PAS de Redux

### Backend

- **Runtime** : Node.js **≥ 20 LTS** + Express — vérifier la version exacte disponible sur l'offre Infomaniak avant de démarrer
- **Base de données** : MySQL — raw queries, PAS d'ORM
- **Auth** : JWT — access token en mémoire React + refresh token cookie httpOnly
- **Upload** : Multer — formats : `jpg`, `jpeg`, `png`, `webp` uniquement | taille max : **5 MB** | nommage : `{uuid}.{ext}` | destination : Infomaniak Cloud Storage (jamais le disque local en production)
- **Emails** : Nodemailer
- **Paiement** : Facture (priorité 1) — Stripe en phase 2 : Twint QR + carte (voir section 5)
- **Livraison** : ShipEngine

### Conventions de code — NON NÉGOCIABLES

- Commentaires : toujours en **FRANÇAIS**
- Variables / fonctions / fichiers : toujours en **ENGLISH**
- Composants React : **fonctionnels uniquement** — zéro classe
- CSS : **un fichier `.module.css` par composant**, dans le même dossier
- SQL : **requêtes paramétrées avec `?`** — zéro concaténation, zéro ORM
- Tokens : **access token en mémoire**, refresh token cookie `httpOnly/Secure/SameSite=Strict`
- Ne pas utiliser `process.env` directement dans les controllers — passer par `config/`

---

## 2. ARCHITECTURE

### Structure des dossiers

```
client/                  # React + Vite (vitrine + tunnel achat)
  src/
    components/          # Composants réutilisables
    pages/               # Une page = un dossier (Page.jsx + Page.module.css)
    hooks/               # Custom hooks
    contexts/            # Context API
    services/            # Appels Axios
    i18n/                # Fichiers de traduction fr/ de/ en/
    utils/               # Helpers (arrondi CHF, TVA...)

admin/                   # React + Vite (back-office)
  src/                   # Même structure que client/
    pages/
      Dashboard/         # KPIs : CA, commandes du jour, stock critique
      Products/          # Liste, création, édition, upload images
      Categories/        # Arborescence catégories + traductions
      Suppliers/         # CRUD fournisseurs
      Orders/            # Liste commandes, détail, changement statut, envoi QR Twint
      Customers/         # Liste clients, détail, import migration
      Reviews/           # Modération avis clients
      Coupons/           # Gestion codes promo
      Settings/          # Config TVA, frais de port, textes légaux
      Loyalty/           # Configuration du programme de fidélité (seuils, récompenses, paliers)

server/
  config/                # db.js, stripe.js, mailer.js, shipengine.js, cache.js, sharp.js
  routes/                # auth.routes.js, products.routes.js...
  controllers/           # auth.controller.js...
  services/              # payment.service.js, email.service.js, shipping.service.js...
  repositories/          # product.repository.js (SQL brut uniquement)
  middlewares/           # auth.js, roles.js, upload.js, validate.js
  utils/                 # chf.utils.js, tva.utils.js
  app.js

database/
  schema.sql             # Tables complètes
  seeds.sql              # Données de test
```

### Rôles & permissions

| Rôle | Accès |
| --- | --- |
| `client` | Boutique, son compte, ses commandes, son panier |
| `admin` | Tout le back-office sauf gestion des comptes admin |
| `super_admin` | Tout — y compris création/suppression comptes admin et migration clients |

**Règles :**
- Rôle stocké dans `users.role` — vérifié côté serveur à chaque requête via middleware `roles.js`
- Jamais faire confiance au rôle envoyé par le client — toujours lire depuis le token JWT
- Routes `/api/v1/admin/*` : middleware `requireRole('admin', 'super_admin')` obligatoire
- Route migration `/api/v1/admin/migrations/*` : middleware `requireRole('super_admin')` uniquement

### Flux backend — obligatoire

```
routes/ → controllers/ → services/ → repositories/
```

- `routes/` : définition des endpoints uniquement, zéro logique
- `controllers/` : logique métier, appel aux services
- `services/` : orchestration (paiement, email, shipping...)
- `repositories/` : toutes les requêtes SQL paramétrées

---

## 3. DÉPLOIEMENT — Infomaniak

| Composant       | Config                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Hébergeur       | Infomaniak (Genève 🇨🇭) — conforme LPD nativement                       |
| Backend runtime | Node.js **≥ 20 LTS** — confirmer la version exacte dans le panel avant de démarrer |
| Frontend        | `dist/` servi en static                                                |
| MySQL           | Base créée via le panel Infomaniak, user dédié avec privilèges limités |
| SSL             | Let's Encrypt via panel Infomaniak — automatique                       |
| Env vars        | `.env` — ne jamais committer, inclure `.env.example`                   |
| Process manager | Selon offre : PM2 si accès SSH, sinon gestionnaire Infomaniak          |
| Médias          | Infomaniak Cloud Storage (Swiss Made) — destination des uploads Multer  |
| Emails          | Infomaniak Mail / Newsletter                                           |

**Environnements :**

| Env | Usage | URL type |
| --- | --- | --- |
| `development` | Local — `.env.local` | `localhost:5173` / `localhost:3000` |
| `staging` | Recette — tests avant prod, migration clients | `staging.broderie-domaine.ch` |
| `production` | Site live | `broderie-domaine.ch` |

- Staging = copie exacte de la prod (même stack, même Infomaniak, base de données séparée)
- Jamais tester la migration des 1800 clients directement en production — staging obligatoire
- Variables `.env.staging` et `.env.production` distinctes — jamais partager les credentials

**Points d'attention Infomaniak :**

- Hébergement en Suisse → données personnelles restent en CH → LPD simplifiée
- CORS : origin = domaine de production exact, pas de wildcard `*`
- Vérifier la version Node.js **≥ 20 LTS** disponible sur l'offre choisie avant de démarrer

---

## 4. BASE DE DONNÉES MYSQL

### Bonnes pratiques

- Soft delete : `deleted_at` sur `users` et `products`
- `product_snapshot_json` dans `order_items` — état produit figé à l'achat
- `tax_rate_snapshot` par ligne commande — TVA figée au moment de l'achat
- Transactions MySQL pour la création de commande (atomique)
- Index sur : `products.slug`, `products.category_id`, `orders.user_id`, `orders.status`
- FULLTEXT sur : `product_translations.name`, `product_translations.description` (par locale)
- `consent_logs` avec IP hashée SHA-256 — jamais stocker l'IP en clair (LPD)

### Schéma

```sql
-- Utilisateurs
users (id, email, password_hash, first_name, last_name, role, locale, is_active, deleted_at, created_at)
addresses (id, user_id, label, street, city, zip, country, canton, is_default)

-- TVA suisse
tax_rates (id, name, rate, category, is_default)
-- Données : standard=8.1%, reduced=2.6%, hotel=3.8%

-- Catalogue multilingue
categories (id, parent_id, slug, image_url, sort_order)
category_translations (id, category_id, locale, name, description)

products (id, category_id, supplier_id, slug, price_chf, compare_price_chf,
          tax_rate_id, sku, stock, weight_kg, is_active, is_featured,
          deleted_at, created_at, updated_at)
          -- price_eur supprimé : marché CH uniquement
product_translations (id, product_id, locale, name, description, slug)
product_images (id, product_id, url, alt, sort_order, is_primary)
product_variants (id, product_id, name, value, price_modifier, stock, sku)

-- Panier
carts (id, user_id, session_id, created_at, updated_at)
      -- currency supprimé : CHF uniquement
cart_items (id, cart_id, product_id, variant_id, quantity, price_snapshot, tax_rate_snapshot)

-- Commandes
orders (id, user_id, status, subtotal, shipping_cost, tax_amount, total, created_at, updated_at)
        -- currency fixe CHF, exchange_rate_snapshot supprimé : marché CH uniquement
order_items (id, order_id, product_id, variant_id, quantity, unit_price,
             tax_rate_snapshot, product_snapshot_json)
             -- tax_rate_snapshot : taux TVA figé au moment de l'achat (seule colonne nécessaire)
order_status_history (id, order_id, status, note, created_by, created_at)

-- Paiements
payments (id, order_id, provider, provider_payment_id, amount, currency,
          method, status, created_at)
          -- method : card | twint | postfinance | invoice

-- Livraison
shipping_zones (id, name, carrier, estimated_days)
                -- zone unique Suisse, customs_required supprimé
shipping_rates (id, zone_id, name, min_weight, max_weight, price_chf, estimated_days)
                -- free_threshold_chf supprimé : frais de port toujours payants

-- Promotions
coupons (id, code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active)

-- Programme de fidélité
loyalty_tiers (id, name, min_spend_chf, reward_type, reward_value, reward_validity_days, is_active, sort_order)
               -- reward_type : fixed | percent
               -- ex: "Argent" — dès CHF 200 cumulés → CHF 20 offerts, valable 90 jours
loyalty_accounts (id, user_id, total_spend_chf, current_tier_id, created_at, updated_at)
loyalty_rewards (id, user_id, tier_id, code, type, value, status, expires_at, created_at)
                 -- status : pending | available | used | expired
loyalty_transactions (id, user_id, order_id, amount_chf, type, created_at)
                      -- type : earn | redeem | refund

-- Avis
reviews (id, user_id, product_id, rating, title, body, is_approved, created_at)

-- Fournisseurs
suppliers (id, name, contact_name, email, phone, address, notes, is_active, created_at)

-- Conformité LPD
consent_logs (id, user_id, session_id, type, version, ip_hash, accepted_at)
```

---

## 5. SPÉCIFICITÉS MARCHÉ SUISSE 🇨🇭

### TVA — obligations légales

- Afficher les prix **TTC** obligatoirement pour les consommateurs finaux
- Détail TVA obligatoire sur toutes les factures (taux + montant par ligne)
- Enregistrement TVA dès **CHF 100'000** de CA annuel
- Déclarations TVA **trimestrielles** auprès de l'AFC
- ~~Ventes vers l'UE~~ — **marché Suisse uniquement**, pas de gestion TVA EU/OSS requise

| Taux | Catégorie                                       |
| ---- | ----------------------------------------------- |
| 8.1% | Taux normal (électronique, vêtements, etc.)     |
| 2.6% | Taux réduit (alimentation, médicaments, livres) |
| 3.8% | Taux spécial (hôtellerie)                       |

### Devise & Arrondi CHF

```js
// Arrondi au 0.05 CHF le plus proche — utils/chf.utils.js
const roundCHF = (amount) => Math.round(amount * 20) / 20;
```

- Devise : **CHF uniquement** — pas de clientèle transfrontalière
- Toujours appeler `roundCHF()` sur les totaux affichés

### Paiement — ordre de priorité

| Moyen       | Priorité      | Notes                                                                     |
| ----------- | ------------- | ------------------------------------------------------------------------- |
| Facture     | 🔴 Priorité 1 | Très attendu en B2C suisse — à implémenter en premier                    |
| Twint QR    | 🟡 Phase 2    | QR code généré et envoyé par email au client — voir section dédiée        |
| Carte       | 🟡 Phase 2    | Visa, Mastercard via Stripe                                               |
| PostFinance | 🟢 Phase 3    | Très utilisé en Suisse                                                    |

### Twint — Paiement par QR code

Le client veut pouvoir **générer un QR code Twint et l'envoyer au client par email** pour qu'il paie depuis son téléphone.

**Deux cas d'usage :**

| Cas | Déclencheur | Description |
| --- | --- | --- |
| Checkout web | Client sur le site | QR affiché à l'écran pendant le tunnel d'achat |
| Envoi par email | Admin depuis le back-office | QR généré + joint au mail de demande de paiement |

**Flux technique (Stripe + Twint) :**

```
1. POST /api/v1/payments/create-intent
   → Stripe crée un PaymentIntent { payment_method_types: ['twint'] }
   → Stripe retourne next_action.twint_display_qr_code.image_url_png

2. Cas checkout web :
   → Frontend affiche le QR code (balise <img>)
   → Polling ou webhook Stripe confirme le paiement

3. Cas envoi par email (admin) :
   → Backend télécharge l'image QR depuis Stripe
   → Nodemailer envoie l'email avec le QR en pièce jointe inline
   → Le client scanne depuis l'email avec l'app Twint
   → Webhook Stripe /payments/webhook valide la commande
```

**Endpoints à implémenter :**

```
POST /api/v1/payments/create-intent          # crée le PaymentIntent Twint, retourne le QR
POST /api/v1/payments/send-twint-qr/:orderId # admin : envoie le QR par email au client
POST /api/v1/payments/webhook                # Stripe webhook → valide la commande
```

**Points d'attention :**
- Le QR Twint a une **durée de validité limitée** (configurable dans Stripe, max 24h)
- Indiquer l'expiration dans l'email envoyé au client
- Un seul QR actif par commande — annuler le précédent avant d'en générer un nouveau
- Le webhook doit être sécurisé par signature Stripe (`stripe.webhooks.constructEvent`)

### Programme de fidélité — configurable par l'admin

Le système est **entièrement paramétrable depuis le back-office** — aucun changement de code requis.

**Ce que l'admin peut configurer :**

| Paramètre | Description | Exemple |
| --- | --- | --- |
| Nom du palier | Libellé affiché au client | "Argent", "Or", "Platine" |
| Seuil d'achat cumulé | Montant CHF total pour atteindre le palier | CHF 200 |
| Type de récompense | Montant fixe ou pourcentage | `fixed` CHF 20 / `percent` 10% |
| Valeur de la récompense | Montant ou taux | 20.00 / 10 |
| Validité du bon | Jours avant expiration du bon généré | 90 jours |
| Actif / Inactif | Désactiver un palier sans le supprimer | — |

**Flux technique :**
```
1. Client passe une commande → paiement confirmé (webhook Stripe)
2. loyalty_transactions : ajout d'une ligne type=earn, amount=total_commande
3. loyalty_accounts : total_spend_chf mis à jour
4. Vérification : le nouveau total atteint-il un palier supérieur ?
5. Si oui → génération d'un loyalty_reward (bon unique, statut=available)
6. Email automatique au client : "Félicitations, vous avez atteint le palier X — bon CHF Y disponible"
7. Le client applique son bon au checkout (comme un coupon)
8. loyalty_transactions : ajout d'une ligne type=redeem
9. loyalty_rewards : statut → used
```

**Règles métier :**
- Un palier n'est atteint **qu'une seule fois** par client — pas de récompense à chaque commande
- Plusieurs paliers possibles (Bronze → Argent → Or) — chacun déclenche son propre bon
- Le bon généré est un code unique à usage unique, traité comme un `coupon` côté checkout
- Les achats remboursés sont déduits du `total_spend_chf`
- Le `total_spend_chf` inclut uniquement les commandes au statut `delivered` ou `paid`

### Livraison — Swiss Post

- Transporteur principal : **La Poste Suisse (Post CH)** via ShipEngine
- **Livraison Suisse uniquement** — pas d'expédition internationale
- **Frais de port toujours payants** — pas de livraison gratuite, même au-delà d'un seuil
- Délais : 1-2j CH

### Multilinguisme

| Région         | Langue                  | Part |
| -------------- | ----------------------- | ---- |
| Romandie       | Français (FR) — défaut  | ~23% |
| Deutschschweiz | Allemand DE-CH (pas DE) | ~63% |
| International  | Anglais (EN)            | —    |

- Dialecte **DE-CH** : pas de `ß`, utiliser `ss`
- URLs localisées : `/fr/` | `/de/` | `/en/`
- Templates emails traduits FR / DE / EN
- Balises `hreflang` sur toutes les pages (SEO multilingue)

### LPD — Conformité données

- Bannière consentement cookies obligatoire (LPD révisée sept. 2023)
- IP stockée **uniquement en SHA-256** dans `consent_logs` — jamais en clair
- Droit d'accès, rectification et suppression — endpoints dédiés
- Notification violation de données dans les **72h**
- Hébergement : Infomaniak (Genève, CH) — données en Suisse, conforme LPD nativement

### CO — Code des Obligations suisse

- Droit de retour : **14 jours** (7j légal, 14j recommandé)
- CGV obligatoires et acceptées avant validation commande
- Confirmation de commande par email obligatoire
- Prix TTC avec TVA détaillée sur toutes les factures

---

## 6. API REST — /api/v1/

### Paramètres communs — pagination & filtres

Toutes les routes de liste (`GET` retournant plusieurs ressources) acceptent :

```
?page=1          # page courante (défaut: 1)
?limit=20        # éléments par page (défaut: 20, max: 100)
?sort=created_at # champ de tri
?order=desc      # sens du tri : asc | desc (défaut: desc)
```

Routes catalogue produits — filtres supplémentaires :
```
?category=slug        # filtrer par catégorie
?q=mot                # recherche FULLTEXT
?min_price=10         # prix CHF minimum
?max_price=200        # prix CHF maximum
?in_stock=true        # uniquement les produits en stock
?featured=true        # uniquement les produits mis en avant
?locale=fr            # langue des traductions (défaut: fr)
```

### Endpoints

```
# Auth
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh-token
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password

# Catalogue
GET    /api/v1/products              # filtres, tri, pagination — voir paramètres communs ci-dessus
GET    /api/v1/products/:id
GET    /api/v1/products/search?q=
GET    /api/v1/categories
GET    /api/v1/categories/:slug/products

# Panier
GET    /api/v1/cart
POST   /api/v1/cart/items
PUT    /api/v1/cart/items/:id
DELETE /api/v1/cart/items/:id

# Commandes
POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/:id

# Paiement
POST   /api/v1/payments/create-intent            # Stripe — retourne QR Twint ou client_secret carte
POST   /api/v1/payments/send-twint-qr/:orderId   # admin : envoie le QR Twint par email
POST   /api/v1/payments/webhook                  # Stripe webhook → validation commande

# Utilisateur
GET    /api/v1/users/me
PUT    /api/v1/users/me
GET    /api/v1/users/me/addresses
POST   /api/v1/users/me/addresses
PUT    /api/v1/users/me/addresses/:id
DELETE /api/v1/users/me/addresses/:id

# Fournisseurs (admin uniquement)
GET    /api/v1/admin/suppliers
POST   /api/v1/admin/suppliers
GET    /api/v1/admin/suppliers/:id
PUT    /api/v1/admin/suppliers/:id
DELETE /api/v1/admin/suppliers/:id

# Avis clients
GET    /api/v1/products/:id/reviews        # liste des avis approuvés d'un produit
POST   /api/v1/products/:id/reviews        # soumettre un avis (client authentifié)

# Avis clients — admin
GET    /api/v1/admin/reviews               # liste tous les avis (approuvés + en attente)
PUT    /api/v1/admin/reviews/:id/approve   # approuver un avis
DELETE /api/v1/admin/reviews/:id           # supprimer un avis

# Migration clients (super_admin uniquement)
POST   /api/v1/admin/migrations/customers

# Fidélité — client
GET    /api/v1/loyalty/me              # solde, palier actuel, historique points
GET    /api/v1/loyalty/me/rewards      # bons de réduction disponibles

# Fidélité — admin
GET    /api/v1/admin/loyalty/tiers     # liste des paliers configurés
POST   /api/v1/admin/loyalty/tiers     # créer un palier
PUT    /api/v1/admin/loyalty/tiers/:id # modifier un palier
DELETE /api/v1/admin/loyalty/tiers/:id # supprimer un palier
GET    /api/v1/admin/loyalty/accounts  # vue globale des comptes fidélité clients
```

---

## 7. MIGRATION — 1800 CLIENTS

Le client possède **1800 comptes** sur l'ancien site à importer.

- Exporter les données depuis l'ancien site (CSV ou dump SQL)
- Script de migration : `database/migrate_customers.js`
- Les mots de passe anciens ne sont pas récupérables → envoyer un email de réinitialisation à chaque client importé
- Champs à mapper : email, prénom, nom, adresse(s), locale
- Exécuter la migration **avant** la mise en production
- Endpoint dédié : `POST /api/v1/admin/migrations/customers` (one-shot, protégé par rôle super-admin)

---

## 8. SÉCURITÉ

### Format de réponse API — standard obligatoire

**Toutes** les réponses API suivent ce format JSON — aucune exception :

```json
// Succès
{ "success": true, "data": { ... } }

// Succès sans données (ex: DELETE)
{ "success": true, "message": "Ressource supprimée" }

// Succès paginé
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }

// Erreur de validation (400)
{ "success": false, "message": "Données invalides", "errors": [{ "field": "email", "message": "Format invalide" }] }

// Erreur métier (401, 403, 404, 409)
{ "success": false, "message": "Message traduit selon la locale" }

// Erreur serveur (500) — jamais de stack trace en production
{ "success": false, "message": "Une erreur est survenue. Veuillez réessayer." }
```

**Règles :**
- Messages d'erreur traduits FR/DE/EN selon la locale du compte (header `Accept-Language` sinon)
- Logger l'erreur complète côté serveur (avec stack trace) — retourner uniquement le message générique au client
- Ne jamais exposer les détails de l'implémentation (noms de tables, chemins de fichiers, etc.)

### Couches de sécurité

| Couche        | Outil / Règle                                                                |
| ------------- | ---------------------------------------------------------------------------- |
| Headers HTTP  | `helmet.js`                                                                  |
| CORS          | Origin = domaine exact, pas de wildcard `*`                                  |
| Rate limiting | `express-rate-limit` sur toutes les routes auth                              |
| Validation    | Zod sur toutes les routes (entrées + sorties)                                |
| SQL injection | Requêtes paramétrées avec `?` uniquement — jamais de concaténation           |
| XSS           | Sanitisation des entrées utilisateur                                         |
| Passwords     | `bcrypt`, salt rounds ≥ 12                                                   |
| JWT           | Access token mémoire React — refresh token `httpOnly/Secure/SameSite=Strict` |
| HTTPS         | Let's Encrypt via panel Infomaniak — obligatoire                             |

---

## 9. EMAILS TRANSACTIONNELS

Tous les emails traduits **FR / DE / EN** selon la locale du compte client.

- Confirmation de commande (avec détail TVA suisse)
- Changement de statut commande
- Confirmation d'expédition + numéro de suivi Swiss Post
- Réinitialisation de mot de passe
- Bienvenue à l'inscription
- Notification retour / remboursement

---

## 10. PERFORMANCE — OBJECTIFS NON NÉGOCIABLES

Le site doit être **perçu comme instantané** par l'utilisateur final. Chaque milliseconde compte.

### Objectifs mesurables

| Métrique | Cible |
| --- | --- |
| Lighthouse Performance | ≥ 90 (mobile et desktop) |
| First Contentful Paint | < 1.2s |
| Time to Interactive | < 2.5s |
| Largest Contentful Paint | < 2s |
| Temps de réponse API (p95) | < 200ms |
| Temps de réponse API (p99) | < 500ms |
| Requête SQL simple | < 20ms |
| Requête SQL avec jointures | < 50ms |

### Volumes attendus — dimensionnement

| Table | Lignes estimées | Remarque |
| --- | --- | --- |
| `products` | ~14 000 | Référentiel complet |
| `product_translations` | ~42 000 | 14 000 × 3 locales |
| `product_images` | ~28 000–42 000 | 2-3 images par produit |
| `product_variants` | ~20 000–30 000 | Variable selon les produits |
| `users` | ~2 000+ | 1 800 migrés + nouveaux |
| `orders` | ~10 000/an | Estimation croissance |

**Ces volumes imposent des règles strictes :**
- Toute requête sur `products` ou `product_translations` **doit** utiliser un index — vérifier avec `EXPLAIN`
- Jamais de `SELECT` sur `product_translations` sans filtre `locale` — sinon 42 000 lignes scannées
- L'import des 14 000 produits se fait en **batch de 500** via `INSERT INTO ... VALUES (...), (...), ...` — jamais ligne par ligne
- Après chaque import en masse : exécuter `ANALYZE TABLE products; ANALYZE TABLE product_translations;`
- Reconstruire l'index FULLTEXT après l'import initial complet (voir commentaires dans schema.sql)

### Base de données — requêtes optimisées

**Index — obligatoires dès le schema.sql :**
```sql
-- Catalogue produits — index composites (is_active en premier, toujours présent dans les filtres boutique)
INDEX idx_products_active_cat   (is_active, category_id)   -- filtre catégorie
INDEX idx_products_active_feat  (is_active, is_featured)   -- page accueil / featured
INDEX idx_products_active_price (is_active, price_chf)     -- tri par prix
INDEX idx_products_stock        (is_active, stock)         -- filtre in_stock
INDEX idx_products_supplier     (supplier_id)
INDEX idx_products_deleted      (deleted_at)
UNIQUE KEY uq_products_slug     (slug)                     -- sert aussi d'index

-- product_translations — 42 000 lignes avec 14 000 produits × 3 locales
INDEX idx_prod_trans_locale_product (locale, product_id)   -- requête la plus fréquente
UNIQUE KEY uq_prod_trans_locale     (product_id, locale)
-- Un seul FULLTEXT combiné — obligatoire pour MATCH(name, description) en une requête
FULLTEXT INDEX idx_ft_prod_name_desc (name, description)

-- product_images — récupération image primaire directe
INDEX idx_prod_images_primary (product_id, is_primary)

-- Commandes
INDEX idx_orders_user    (user_id)
INDEX idx_orders_status  (status)
INDEX idx_orders_created (created_at)

-- Panier
INDEX idx_carts_user    (user_id)
INDEX idx_carts_session (session_id)
```

**Règles SQL obligatoires :**
- `SELECT` uniquement les colonnes nécessaires — jamais `SELECT *`
- Toujours utiliser `EXPLAIN` pour valider les requêtes avec jointures avant de les merger
- Limiter les jointures à 3 tables maximum par requête — décomposer si plus complexe
- Pagination obligatoire sur toutes les listes — jamais `SELECT` sans `LIMIT`
- Pas de requêtes dans des boucles — utiliser `IN (...)` ou une jointure

**Requêtes N+1 — interdites :**
```js
// INTERDIT — 1 requête par produit
for (const product of products) {
  product.images = await getImages(product.id) // N requêtes
}

// OBLIGATOIRE — 1 seule requête
const images = await getImagesByProductIds(products.map(p => p.id)) // 1 requête avec IN (...)
```

### Cache — stratégie par couche

| Données | Stratégie | TTL |
| --- | --- | --- |
| Catalogue produits (liste) | Cache mémoire Node.js (`node-cache`) | 5 min |
| Détail produit | Cache mémoire Node.js | 5 min |
| Catégories | Cache mémoire Node.js | 30 min |
| Taux TVA | Cache mémoire Node.js | 24h |
| Frais de port | Cache mémoire Node.js | 24h |
| Panier, commandes, compte | Jamais mis en cache — données personnelles temps réel | — |

- Invalider le cache produit immédiatement à chaque modification via l'admin
- Clé de cache incluant la locale : `products:list:fr:page1`, `product:42:de`

### Frontend — performance de rendu

**Images :**
- Toujours servir les images en **WebP** (conversion à l'upload via `sharp`)
- Générer **3 tailles** à l'upload : thumbnail (200px), medium (600px), large (1200px)
- Attributs `srcset` et `sizes` obligatoires sur toutes les images produit
- `loading="lazy"` sur toutes les images hors viewport initial
- Dimensions `width` et `height` toujours précisées — évite le layout shift (CLS)

**Code :**
- Code splitting par route — React lazy + Suspense obligatoires sur toutes les pages
- Bundle admin séparé du bundle client — jamais chargé par les visiteurs
- Pas de dépendances inutiles — auditer avec `vite-bundle-visualizer` avant livraison
- Polices web : `font-display: swap` obligatoire, précharger la police principale

**Requêtes réseau :**
- Debounce 300ms sur la recherche — jamais appeler l'API à chaque frappe
- Optimistic UI sur ajout panier et changement quantité — pas d'attente perçue
- Axios : timeout global à **8 secondes** — jamais laisser une requête bloquée indéfiniment
- Annuler les requêtes en cours avec `AbortController` lors du démontage des composants

### Serveur Node.js

- **Compression gzip** : middleware `compression` activé sur toutes les réponses
- **Headers de cache HTTP** sur les assets statiques : `Cache-Control: public, max-age=31536000, immutable`
- **Keep-Alive** activé sur les connexions MySQL — ne pas ouvrir/fermer une connexion par requête
- **Connection pool MySQL** : min 5, max 20 connexions
- Monitoring : logguer les requêtes API dépassant **200ms** — signal d'alerte à investiguer

```js
// Exemple config pool MySQL — config/db.js
{
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
}
```

### Règles de performance pour Claude Code — spécifiques 14 000 produits

- Ne jamais écrire `SELECT *` — toujours lister les colonnes explicitement
- Ne jamais faire de requête SQL dans une boucle
- Toujours paginer les listes avec `LIMIT` et `OFFSET`
- Toujours ajouter les index lors de la création d'une table
- Toujours utiliser le pool de connexions — jamais `mysql.createConnection()` directement
- Toujours convertir les images en WebP et générer les 3 tailles à l'upload
- Toujours implémenter le cache sur les données de catalogue
- Toujours utiliser `React.lazy()` pour les pages
- **Toujours filtrer par `locale`** sur `product_translations` — jamais sans ce filtre
- **Toujours filtrer par `is_active = 1` et `deleted_at IS NULL`** sur `products` en boutique
- **Import produits en batch de 500** — jamais INSERT ligne par ligne sur les 14 000 références
- **`weight_kg` sur `products`** — toujours renseigner pour le calcul des frais de port Swiss Post

---

## 11. QUALITÉ & TESTS

Projet livré à **100%** — zéro fonctionnalité partielle, zéro bug connu en production.

### Tests — obligatoires par couche

| Couche | Outil | Ce qui doit être testé |
| --- | --- | --- |
| Repositories | Jest + base de test MySQL | Chaque requête SQL — SELECT, INSERT, UPDATE, DELETE |
| Services | Jest (unit) | Logique métier, calculs TVA, arrondis CHF, statuts commande |
| Controllers | Supertest | Chaque endpoint — codes HTTP, formats de réponse, cas d'erreur |
| Frontend | Vitest + Testing Library | Composants critiques : panier, checkout, formulaires, auth |
| E2E | Playwright | Tunnel d'achat complet, paiement Twint QR, gestion commande admin |

**Règles :**
- Coverage minimum : **80%** sur services et repositories
- Chaque bug corrigé → test de non-régression ajouté obligatoirement
- Tests E2E sur les 3 flux critiques avant chaque mise en production :
  1. Inscription → commande → paiement → confirmation email
  2. Admin → création produit → visible en boutique
  3. Admin → génération QR Twint → paiement → statut commande mis à jour

### Validation des données — exhaustive

- **Toutes** les entrées API validées avec Zod (pas seulement les routes auth)
- Messages d'erreur explicites et traduits FR/DE/EN
- Codes HTTP stricts : `400` validation, `401` non authentifié, `403` non autorisé, `404` introuvable, `409` conflit, `500` erreur serveur
- Jamais retourner un stack trace en production — logger côté serveur, message générique côté client

### Base de données — intégrité garantie

- Transactions MySQL sur **toutes** les opérations multi-tables (commande, paiement, stock)
- Contraintes FK déclarées dans le schema — pas de cohérence assurée uniquement par le code
- Stock décrémenté **dans la même transaction** que la création de commande
- Tester les cas de concurrence : deux achats simultanés du dernier article en stock
- Backup automatique configuré sur Infomaniak avant chaque déploiement

---

## 12. UX & FRONTEND — EXIGENCES COMPLÈTES

Chaque page et chaque interaction doit être **finie** — aucun état manquant.

### États obligatoires sur chaque composant

| État | Exemple concret |
| --- | --- |
| **Loading** | Skeleton ou spinner pendant tout appel API |
| **Empty state** | "Votre panier est vide", "Aucun produit trouvé" avec CTA |
| **Erreur réseau** | Message clair + bouton "Réessayer" |
| **Erreur de validation** | Inline sous chaque champ — jamais en alert() |
| **Succès** | Confirmation visuelle après chaque action (toast ou redirect) |
| **État désactivé** | Bouton "Commander" désactivé si panier vide ou stock épuisé |

### Responsive — breakpoints obligatoires

- Mobile 375px, Tablette 768px, Desktop 1280px
- Tunnel d'achat 100% fonctionnel sur mobile (priorité : 60%+ du trafic suisse)
- QR code Twint lisible et scannable sur toutes tailles d'écran

### Accessibilité — minimum requis

- Contraste WCAG AA sur tous les textes
- Navigation clavier complète (tab, enter, escape)
- Labels sur tous les champs de formulaire
- Alt text sur toutes les images produit
- Focus visible sur tous les éléments interactifs

### Performance

- Lazy loading sur les images produit (`loading="lazy"`)
- Pagination ou infinite scroll sur le catalogue — jamais charger tous les produits d'un coup
- Debounce sur la recherche produit (300ms)
- Optimistic UI sur l'ajout au panier

### UX — règles métier

- Prix TTC toujours visible — jamais afficher un prix HT sans préciser
- TVA détaillée au récapitulatif et sur la facture
- Frais de port affichés **avant** la saisie de l'adresse (montant fixe connu)
- Stock affiché si ≤ 5 articles restants ("Plus que 3 en stock")
- Confirmation de commande par email envoyée **dans les 30 secondes** après validation paiement

---

## 13. CHECKLIST DE LIVRAISON

Tout doit être vert avant de mettre en production.

### Performance
- [ ] Lighthouse ≥ 90 sur mobile ET desktop (Production URL)
- [ ] Aucune requête `SELECT *` dans le code — vérifier avec grep
- [ ] Aucune requête SQL dans une boucle — vérifier avec grep
- [ ] Tous les index du schema.sql créés et vérifiés avec `EXPLAIN`
- [ ] Connection pool MySQL configuré (min 5, max 20)
- [ ] Cache mémoire actif sur catalogue, catégories, TVA, frais de port
- [ ] Compression gzip activée sur le serveur Express
- [ ] Images converties en WebP avec 3 tailles générées à l'upload
- [ ] `srcset` présent sur toutes les images produit
- [ ] Code splitting vérifié — bundle analysé avec `vite-bundle-visualizer`
- [ ] Temps de réponse API p95 < 200ms — mesuré sur staging sous charge

### Backend
- [ ] Toutes les routes testées avec Supertest — aucun endpoint non couvert
- [ ] Variables d'environnement documentées dans `.env.example`
- [ ] Webhook Stripe validé avec signature — jamais désactivé
- [ ] Rate limiting actif sur toutes les routes auth
- [ ] Helmet.js configuré — headers de sécurité vérifiés
- [ ] CORS configuré sur le domaine de production exact
- [ ] Logs d'erreur configurés (pas de console.log en production)
- [ ] Migration 1800 clients testée sur environnement de staging

### Base de données
- [ ] `schema.sql` à jour et exécutable de zéro sans erreur
- [ ] `seeds.sql` fournit des données de test réalistes
- [ ] Index créés et vérifiés avec `EXPLAIN` sur les requêtes fréquentes
- [ ] Transactions testées sous charge concurrente
- [ ] Soft delete vérifié — les produits/utilisateurs supprimés n'apparaissent pas en boutique
- [ ] Import 14 000 produits exécuté en batch de 500 — aucun INSERT ligne par ligne
- [ ] `ANALYZE TABLE products; ANALYZE TABLE product_translations;` exécuté après import en masse
- [ ] `SELECT COUNT(*) FROM products WHERE weight_kg IS NULL AND is_active = 1` = 0

### Frontend client
- [ ] Tunnel d'achat complet testé (desktop + mobile)
- [ ] Paiement Twint QR testé en mode test Stripe
- [ ] Paiement carte testé en mode test Stripe
- [ ] Tous les emails transactionnels reçus et vérifiés (FR/DE/EN)
- [ ] Pages 404 et erreur 500 personnalisées
- [ ] Balises `hreflang` présentes sur toutes les pages
- [ ] Meta title et description renseignés sur chaque page
- [ ] Lighthouse score ≥ 90 (Performance, Accessibilité, SEO)

### Admin
- [ ] CRUD produits fonctionnel avec upload image
- [ ] CRUD fournisseurs fonctionnel
- [ ] Gestion commandes : changement de statut + email automatique
- [ ] Génération et envoi QR Twint depuis l'admin testé
- [ ] Modération avis clients fonctionnelle (approbation + suppression)
- [ ] Import/migration clients testé sur données réelles anonymisées
- [ ] Rôles admin vérifiés — un client ne peut pas accéder à l'admin

### Staging (avant passage en prod)
- [ ] Staging déployé sur Infomaniak avec base de données séparée
- [ ] Migration 1800 clients validée sur staging — aucune erreur
- [ ] Email de réinitialisation reçu sur un compte test migré
- [ ] Tunnel d'achat complet validé sur staging par le client

### Infomaniak (production)
- [ ] SSL actif et HTTPS forcé
- [ ] Domaine de production configuré dans CORS et Stripe
- [ ] PM2 ou gestionnaire de process configuré
- [ ] Backup base de données automatique activé
- [ ] Variables d'environnement production saisies dans le panel
- [ ] `.env.staging` et `.env.production` distincts — aucun credential partagé

---

## 14. RÈGLES POUR CLAUDE CODE

Règles non négociables à respecter sur chaque génération de code :

- Commentaires **TOUJOURS en français**
- Variables / fonctions / fichiers **TOUJOURS en anglais**
- Composants React **fonctionnels uniquement** — zéro classe
- **CSS Modules uniquement** — un `.module.css` par composant, même dossier
- Icônes : **lucide-react uniquement**
- HTTP : **Axios uniquement**
- SQL : **requêtes paramétrées avec `?`** — zéro concaténation, zéro ORM
- Architecture backend : `routes → controllers → services → repositories`
- Auth : access token mémoire, refresh token httpOnly cookie
- Toujours utiliser `roundCHF()` pour les montants affichés
- Toujours stocker `tax_rate_snapshot` dans `order_items`
- IP dans `consent_logs` : **SHA-256 uniquement** — jamais en clair
- Ne pas utiliser `process.env` directement dans les controllers — passer par `config/`
- **Devise CHF uniquement** — ne jamais afficher EUR ni gérer de taux de change
- **Frais de port toujours payants** — ne jamais implémenter de livraison gratuite conditionnelle
- **Livraison Suisse uniquement** — pas de logique douanière internationale
- **Module fournisseur** dans l'admin — toujours lier `supplier_id` sur les produits
- **Jamais `SELECT *`** — toujours lister les colonnes explicitement
- **Jamais de requête SQL dans une boucle** — utiliser `IN (...)` ou une jointure
- **Toujours paginer** les listes avec `LIMIT` / `OFFSET`
- **Toujours le pool MySQL** — jamais `mysql.createConnection()` directement
- **Toujours `React.lazy()`** sur les pages — code splitting obligatoire
- **Toujours WebP + 3 tailles** à l'upload d'image via `sharp`
- **Toujours le cache** sur les données de catalogue (node-cache, TTL 5 min)

---

_Supaco Digital — Stack Référence E-Commerce CH — 2026_
