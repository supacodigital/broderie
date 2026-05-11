# État du projet — Au Point-Compté
**Dernière mise à jour : 11 mai 2026**
Stack : React + Vite + CSS Modules | Node.js + Express | MySQL | Infomaniak

---

## Résumé rapide

| Domaine | État |
|---|---|
| Backend API | ✅ Complet |
| Boutique client (frontend) | ✅ Complet |
| Back-office admin | ✅ Complet |
| Paiement Stripe (Twint + Carte) | ✅ Fonctionnel en mode test |
| Emails transactionnels | ✅ Fonctionnels (Mailtrap en dev) |
| Programme de fidélité | ✅ Complet |
| Codes promo | ✅ Complet |
| Tests automatisés | ✅ ~140/140 verts (estimation) |
| Déploiement Infomaniak | ❌ Non démarré |
| Migration 1800 clients | ❌ En attente du fichier client |
| Expédition La Poste CH | ⚠️ Code complet (mock) — accès API client manquants |
| i18n DE-CH | ⚠️ Partiel — traductions FR complètes |

---

## Ce qui est terminé

### Backend

- **Auth** — JWT access token en mémoire + refresh token httpOnly, register, login, logout, forgot/reset password
- **Catalogue** — produits avec filtres, tri, pagination, search FULLTEXT, catégories multilingues (FR/DE/EN)
- **Panier** — visiteur anonyme (session cookie) et utilisateur connecté, fusion panier à la connexion
- **Commandes** — création atomique (transaction MySQL, décrémentation stock), liste, détail, historique statuts
- **Paiement Stripe** — Twint QR via PaymentElement natif, carte Visa/Mastercard, webhook signature vérifiée
- **Coupons** — validation (expiration, limite d'utilisation, montant minimum), application au checkout, incrémentation usage
- **Programme de fidélité** — paliers configurables par admin, earn sur paiement confirmé ET livraison, refund sur annulation/remboursement, bons générés automatiquement
- **Emails** — confirmation commande, changement statut, expédition + tracking, réinitialisation mot de passe, bienvenue, fidélité
- **Avis clients** — soumission, modération admin (approbation/suppression)
- **Fournisseurs** — CRUD complet admin
- **Newsletters** — inscription/désinscription
- **Pages légales** — CGV, mentions légales, politique de retour (éditables via admin)
- **Expédition La Poste CH** — génération étiquette (mock), téléchargement PDF, saisie tracking manuel, frais dynamiques par poids depuis la BDD (`shipping_rates`), endpoint public `GET /api/v1/shipping/rates?weight=`
- **LPD** — IP hashée SHA-256 dans consent_logs, soft delete users/products

### Frontend boutique

- **Accueil** — hero, featured products, avis clients, newsletter
- **Catalogue** — filtres (catégorie, prix, stock), tri, vue grille/liste, pagination
- **Produit** — galerie images, variants, ajout panier, avis, stock restant si ≤ 5
- **Panier** — optimistic UI, mise à jour quantité, suppression, frais de port dynamiques par tranche de poids (Swiss Post)
- **Checkout (3 étapes)** — adresse (préremplie depuis le compte), paiement (Twint QR ou carte), confirmation, frais de port dynamiques depuis l'API
- **Code promo** — saisie dans le checkout, validation live, affichage remise dans le récapitulatif
- **Compte client** — profil, adresses, commandes, historique, onglet fidélité (solde, palier, bons disponibles)
- **Auth** — connexion, inscription, mot de passe oublié/réinitialisation
- **Pages légales** — CGV, mentions légales, politique de retour
- **404 personnalisée**

### Admin back-office

- **Dashboard** — KPIs (CA du jour, commandes, stock critique, nouveaux clients)
- **Produits** — liste, création, édition, upload images WebP (3 tailles via sharp)
- **Catégories** — arborescence avec traductions FR/DE/EN
- **Commandes** — liste filtrée, détail, changement de statut + email automatique, envoi QR Twint par email, génération étiquette La Poste CH (mode mock), saisie tracking manuel, téléchargement PDF étiquette
- **Clients** — liste, détail, programme de fidélité
- **Fournisseurs** — CRUD complet
- **Avis** — modération (approbation, suppression)
- **Coupons** — création, édition, activation/désactivation
- **Fidélité** — configuration des paliers (seuil, récompense, validité)
- **Paramètres** — textes légaux, taux TVA, frais de port

### Tests

- **~140 tests** — tous verts (Jest + Supertest)
- **16 suites** : unit (chf.utils, tva.utils, coupon logique, order calculs avec frais dynamiques, loyalty service) + intégration (auth, products, categories, cart, orders, payments, admin, newsletter, coupons, **shipping**)
- Nouveaux tests : tranches de poids Swiss Post (8 limites), étiquette La Poste CH (génération + PDF + tracking), frais dynamiques dans les commandes
- Couverture services métier critiques : order.service 98%, loyalty.service 96%, cart.service 79%, order.repository 93%

---

## Ce qui reste à faire

### Avant mise en production — obligatoire

#### 1. Déploiement Infomaniak
- [ ] Créer l'hébergement Node.js ≥ 20 LTS sur le panel Infomaniak
- [ ] Créer la base MySQL de production via le panel
- [ ] Exécuter `database/schema.sql` sur la base de production
- [ ] Configurer les variables d'environnement de production dans le panel
- [ ] Configurer PM2 ou le gestionnaire de process Infomaniak
- [ ] Activer SSL Let's Encrypt
- [ ] Configurer le CORS sur le domaine de production exact
- [ ] Vérifier `npm run build` frontend et admin → copier `dist/` sur le serveur
- [ ] Tester le tunnel d'achat complet sur le domaine de production

#### 2. Stripe production
- [ ] Créer un compte Stripe en mode production
- [ ] Remplacer `sk_test_...` par `sk_live_...` dans `.env.production`
- [ ] Remplacer `pk_test_...` par `pk_live_...` dans `frontend/.env.production`
- [ ] Configurer le webhook Stripe sur le dashboard : URL `https://broderie-domaine.ch/api/v1/payments/webhook`
- [ ] Remplacer `STRIPE_WEBHOOK_SECRET` par la vraie valeur `whsec_...` de production
- [ ] Activer Twint dans le dashboard Stripe (nécessite un compte bancaire suisse)
- [ ] Tester un paiement carte réel en production avec un petit montant

#### 3. La Poste CH — étiquettes (accès API réels)
- [ ] Recevoir les identifiants API La Poste CH du client (Kundennummer, Frankiernummer, Client ID, Client Secret)
- [ ] Renseigner `SWISS_POST_CLIENT_ID`, `SWISS_POST_CLIENT_SECRET`, `SWISS_POST_KUNDENNUMMER`, `SWISS_POST_FRANKIERNUMMER` dans `.env.production`
- [ ] Tester la génération d'une étiquette Swiss Post réelle depuis l'admin (page commande → "Générer étiquette")
- [ ] Vérifier que le numéro de suivi retourné est valide sur le site Post.ch

#### 4. Emails production
- [ ] Configurer un compte email Infomaniak Mail (ex: `noreply@broderie-domaine.ch`)
- [ ] Remplacer les credentials Mailtrap par les SMTP Infomaniak dans `.env.production`
- [ ] Tester la réception des emails transactionnels depuis la prod (confirmation commande, reset password)

#### 5. Migration 1800 clients
- [ ] Recevoir le fichier CSV ou dump SQL de l'ancien site
- [ ] Adapter le script `database/migrate_customers.js` aux colonnes du fichier reçu
- [ ] Tester la migration sur l'environnement de staging (base séparée)
- [ ] Vérifier que l'email de réinitialisation est bien reçu par les comptes migrés
- [ ] Exécuter `POST /api/v1/admin/migrations/customers` depuis un compte super_admin
- [ ] Valider que les 1800 comptes sont importés sans erreur avant de passer en prod

### Améliorations souhaitables (non bloquantes)

#### i18n DE-CH
- [ ] Traduire les nouveaux textes (checkout coupon, onglet fidélité, emails) en `de` dans `frontend/src/i18n/de/`
- [ ] Vérifier l'utilisation du dialecte DE-CH (pas de `ß`, utiliser `ss`)
- [ ] Tester l'interface en allemand sur les pages critiques (checkout, compte)

#### SEO
- [ ] Ajouter les balises `<title>` et `<meta name="description">` spécifiques par page
- [ ] Ajouter les balises `hreflang` sur toutes les pages (`fr-CH`, `de-CH`, `en`)
- [ ] Générer le `sitemap.xml` et le soumettre à Google Search Console

#### Performance
- [ ] Auditer le bundle avec `vite-bundle-visualizer` avant livraison
- [ ] Mesurer Lighthouse ≥ 90 sur mobile depuis l'URL de production
- [ ] Vérifier que tous les index SQL sont bien créés (`EXPLAIN` sur les requêtes fréquentes)

#### Tests complémentaires
- [ ] Tests E2E Playwright — tunnel achat complet (inscription → commande → email)
- [ ] Tests E2E Playwright — admin génère QR Twint → paiement → statut mis à jour
- [ ] Augmenter la couverture sur `email.service.js` et `payment.service.js` (actuellement < 50%)

---

## Variables d'environnement à configurer pour la production

Fichier `.env.production` à créer (ne jamais committer) :

```env
NODE_ENV=production
PORT=3000

# Domaines
CLIENT_URL=https://broderie-domaine.ch
ADMIN_URL=https://broderie-domaine.ch/admin

# Base de données Infomaniak
DB_HOST=<host MySQL Infomaniak>
DB_PORT=3306
DB_NAME=<nom de la base>
DB_USER=<utilisateur dédié>
DB_PASSWORD=<mot de passe>

# JWT — générer des secrets aléatoires forts (openssl rand -base64 64)
JWT_SECRET=<secret fort>
JWT_REFRESH_SECRET=<secret fort>

# Stripe production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLIC_KEY=pk_live_...

# Emails Infomaniak Mail
MAIL_HOST=mail.infomaniak.com
MAIL_PORT=587
MAIL_USER=noreply@broderie-domaine.ch
MAIL_PASSWORD=<mot de passe email>
MAIL_FROM=Au Point-Compté <noreply@broderie-domaine.ch>

# La Poste CH — accès API expédition
SWISS_POST_CLIENT_ID=<client ID La Poste CH>
SWISS_POST_CLIENT_SECRET=<client secret La Poste CH>
SWISS_POST_KUNDENNUMMER=<numéro client La Poste>
SWISS_POST_FRANKIERNUMMER=<numéro affranchissement>
```

---

## Architecture — rappel rapide

```
backend/          → API Express (port 3000)
  routes/         → définition endpoints
  controllers/    → logique métier
  services/       → orchestration (email, paiement, shipping)
  repositories/   → requêtes SQL paramétrées
  config/         → db.js, stripe.js, mailer.js, shipengine.js

frontend/         → Boutique React (Vite)
  src/pages/      → Account, Cart, Catalogue, Checkout, Home, Product...
  src/services/   → appels Axios vers /api/v1/
  src/contexts/   → AuthContext, CartContext

admin/            → Back-office React (Vite)
  src/pages/      → Dashboard, Orders, Products, Customers, Coupons, Loyalty...

database/
  schema.sql      → schéma complet (à exécuter pour initialiser)
  seeds.sql       → données de test
```

---

*Supaco Digital — Au Point-Compté — 2026*
