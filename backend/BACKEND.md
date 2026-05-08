# Backend — Fonctionnalités implémentées

Stack : Node.js + Express | MySQL (raw queries) | JWT | Multer + Sharp | node-cache

---

## Auth — /api/v1/auth

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | /register | Inscription client — hash bcrypt salt 12 |
| POST | /login | Connexion — retourne access token (15min) + refresh cookie httpOnly |
| POST | /logout | Déconnexion — efface le cookie refresh token |
| POST | /refresh-token | Renouvelle l'access token via le cookie refresh (7j) |

**Sécurité :**
- Rate limiting : 10 requêtes / 15 min sur register et login
- Access token stocké en mémoire React (pas localStorage)
- Refresh token cookie httpOnly / Secure / SameSite=Strict
- Rôles vérifiés côté serveur à chaque requête (jamais depuis le client)

---

## Catalogue — /api/v1/products

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /products | Liste paginée avec filtres |
| GET | /products/:id | Détail produit (images + variantes) |
| GET | /products/search?q= | Recherche FULLTEXT MySQL |
| GET | /categories | Liste des catégories |
| GET | /categories/:slug/products | Produits par catégorie |

**Filtres disponibles :**
- `?locale=fr` — langue des traductions (fr / de / en)
- `?page=1&limit=20` — pagination (max 100)
- `?sort=price_chf&order=asc` — tri
- `?category=slug` — filtre catégorie
- `?min_price=10&max_price=200` — filtre prix CHF
- `?in_stock=true` — uniquement en stock
- `?featured=true` — uniquement mis en avant

**Performance :**
- Cache node-cache 5 min sur listes et détails produits
- Cache 30 min sur catégories
- Invalidation immédiate après modification admin
- Index composites MySQL (is_active en premier)
- Jamais SELECT * — colonnes explicites
- LIMIT/OFFSET paginés obligatoires

---

## Panier — /api/v1/cart

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /cart | Récupérer le panier |
| POST | /cart/items | Ajouter un article |
| PUT | /cart/items/:id | Modifier la quantité |
| DELETE | /cart/items/:id | Supprimer un article |

**Fonctionnement :**
- Visiteur anonyme : panier lié à un cookie `cartSession` (UUID, 30j)
- Utilisateur connecté : panier lié à `user_id`
- Auth optionnelle via middleware `optionalAuth`
- Vérification stock à chaque ajout / modification
- Prix figé au moment de l'ajout (`price_snapshot`)
- Total calculé et arrondi au 0.05 CHF (`roundCHF`)

---

## Commandes — /api/v1/orders

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | /orders | Créer une commande depuis le panier |
| GET | /orders | Mes commandes (paginées) |
| GET | /orders/:id | Détail d'une commande |

**Fonctionnement :**
- Transaction MySQL atomique : vérif stock + décrémentation + création commande + items
- `product_snapshot_json` figé à l'achat (nom, SKU, description)
- `tax_rate_snapshot` figé par ligne (TVA au moment de l'achat)
- TVA extraite du TTC : `montant × taux / (1 + taux)`
- Frais de port fixes : CHF 8.50 (toujours payants)
- Historique de statut créé automatiquement à la création
- Authentification obligatoire

---

## Compte utilisateur — /api/v1/users

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /users/me | Profil de l'utilisateur connecté |
| PUT | /users/me | Modifier son profil |
| GET | /users/me/addresses | Ses adresses |
| POST | /users/me/addresses | Ajouter une adresse |
| PUT | /users/me/addresses/:id | Modifier une adresse |
| DELETE | /users/me/addresses/:id | Supprimer une adresse |
| GET | /users/me/wishlist | Liste de souhaits (avec infos produit) |
| POST | /users/me/wishlist/:productId | Ajouter un produit à la wishlist |
| DELETE | /users/me/wishlist/:productId | Retirer un produit de la wishlist |

---

## Newsletter — /api/v1/newsletter

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | /newsletter/subscribe | Inscription newsletter (email + locale) |
| POST | /newsletter/unsubscribe | Désabonnement |

**Fonctionnement :**
- Réactivation automatique si email déjà inscrit mais désabonné
- Retour `200` si déjà actif (pas d'erreur)
- Table `newsletter_subscribers` avec `is_active`, `locale`, `unsubscribed_at`

---

## Avis clients — /api/v1/products/:id/reviews

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /products/:id/reviews | Avis approuvés d'un produit (public) |
| POST | /products/:id/reviews | Soumettre un avis (authentifié) |

**Fonctionnement :**
- Les avis sont soumis en attente de modération (`is_approved = 0`)
- Seuls les avis approuvés sont visibles publiquement
- Note obligatoire entre 1 et 5

---

## Programme de fidélité — /api/v1/loyalty

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /loyalty/me | Solde, palier actuel, historique, paliers disponibles |
| GET | /loyalty/me/rewards | Bons de réduction disponibles |

**Fonctionnement :**
- Paliers entièrement configurables depuis l'admin (sans code)
- Déclenchement automatique au passage d'un seuil
- Un seul bon généré par palier, à vie
- Types de récompense : `fixed` (CHF) ou `percent` (%)
- Transactions : `earn` (achat) / `refund` (remboursement)
- Bon généré avec code unique, statut `available` → `used`

---

## Admin — /api/v1/admin

> Toutes les routes admin requièrent `requireAuth` + `requireRole('admin', 'super_admin')`

### Produits

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/products | Liste tous les produits (actifs + inactifs) |
| POST | /admin/products | Créer un produit avec traductions FR/DE/EN |
| GET | /admin/products/:id | Détail d'un produit |
| PUT | /admin/products/:id | Modifier un produit + traductions |
| DELETE | /admin/products/:id | Soft delete (deleted_at) |
| POST | /admin/products/:id/images | Upload image → WebP 3 tailles |
| DELETE | /admin/products/:id/images/:imageId | Supprimer une image |

**Upload images :**
- Formats acceptés : jpg, jpeg, png, webp
- Taille max : 5 MB
- Conversion automatique en WebP via `sharp`
- 3 tailles générées : thumbnail (200px), medium (600px), large (1200px)
- Nommage : `{uuid}-{taille}.webp`

### Catégories

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/categories | Liste toutes les catégories avec toutes leurs traductions |
| POST | /admin/categories | Créer une catégorie avec traductions FR/DE/EN |
| GET | /admin/categories/:id | Détail d'une catégorie |
| PUT | /admin/categories/:id | Modifier une catégorie + traductions |
| DELETE | /admin/categories/:id | Supprimer (bloqué si des produits sont liés) |

**Règles :**
- Slug unique vérifié avant création et modification (retourne 409 si conflit)
- Suppression bloquée avec message clair si des produits actifs sont liés à la catégorie
- Traduction française obligatoire (`translations.fr.name`)
- Invalidation du cache catégories (TTL 30 min) après chaque modification

### Fournisseurs

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/suppliers | Liste avec recherche et pagination |
| POST | /admin/suppliers | Créer un fournisseur |
| GET | /admin/suppliers/:id | Détail fournisseur |
| PUT | /admin/suppliers/:id | Modifier un fournisseur |
| DELETE | /admin/suppliers/:id | Supprimer un fournisseur |

### Commandes

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/orders | Liste toutes les commandes (filtre par statut) |
| GET | /admin/orders/:id | Détail commande |
| PUT | /admin/orders/:id/status | Changer le statut + historique automatique |

**Statuts valides :** `pending` / `awaiting_payment` / `paid` / `processing` / `shipped` / `delivered` / `cancelled` / `refunded`

### Avis clients

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/reviews | Tous les avis (approuvés + en attente) |
| PUT | /admin/reviews/:id/approve | Approuver un avis |
| DELETE | /admin/reviews/:id | Supprimer un avis |

### Clients

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/customers | Liste clients avec recherche |
| GET | /admin/customers/:id | Détail client (adresses + commandes) |

### Programme de fidélité (admin)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /admin/loyalty/tiers | Liste tous les paliers |
| POST | /admin/loyalty/tiers | Créer un palier |
| PUT | /admin/loyalty/tiers/:id | Modifier un palier |
| DELETE | /admin/loyalty/tiers/:id | Supprimer un palier |
| GET | /admin/loyalty/accounts | Vue globale des comptes clients |

---

## Middlewares

| Middleware | Rôle |
|------------|------|
| `auth.js` | Vérifie le JWT Bearer token (access token) |
| `optionalAuth.js` | Décode le token si présent, ne bloque pas les anonymes |
| `roles.js` | Vérifie le rôle depuis le token JWT |
| `upload.js` | Multer mémoire, 5MB max, formats jpg/png/webp |
| `errorHandler.js` | Gestion centralisée des erreurs — stack trace loggé, message générique en prod |

---

## Utilitaires

| Fichier | Fonctions |
|---------|-----------|
| `utils/chf.utils.js` | `roundCHF()` — arrondi au 0.05 CHF / `formatCHF()` |
| `utils/tva.utils.js` | `extractTVA()` / `toHT()` / `toTTC()` — TVA suisse (8.1% / 2.6% / 3.8%) |
| `config/db.js` | Pool MySQL (max 20 connexions, keep-alive) |
| `config/cache.js` | node-cache avec TTL par type + clés localisées + invalidation |
| `config/sharp.js` | Conversion WebP + génération 3 tailles |

---

## Format de réponse API (standard)

```json
// Succès
{ "success": true, "data": { ... } }

// Succès paginé
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }

// Succès sans données
{ "success": true, "message": "Ressource supprimée" }

// Erreur
{ "success": false, "message": "Message d'erreur" }

// Erreur de validation
{ "success": false, "message": "Données invalides", "errors": [{ "field": "email", "message": "Format invalide" }] }
```

---

## Ce qui reste à implémenter

- `POST /api/v1/payments/create-intent` — Stripe (Twint QR + carte)
- `POST /api/v1/payments/send-twint-qr/:orderId` — envoi QR par email (admin)
- `POST /api/v1/payments/webhook` — webhook Stripe
- `POST /api/v1/auth/forgot-password` — réinitialisation mot de passe
- `POST /api/v1/auth/reset-password`
- Emails transactionnels (Nodemailer) — confirmation commande, expédition, bienvenue
- ShipEngine — calcul frais de port Swiss Post
- Migration 1800 clients — `POST /api/v1/admin/migrations/customers`
- Frontend client (React + Vite)
- Frontend admin (React + Vite)

---

*Supaco Digital — Backend Broderie E-Commerce CH — 2026*
