-- ============================================================
-- Schéma base de données — Broderie E-Commerce CH
-- Supaco Digital — 2026
-- Compatible MySQL 8.0+ (MAMP local / Infomaniak production)
-- ============================================================
-- Volumes attendus :
--   products            ~14 000 lignes
--   product_translations ~42 000 lignes (14 000 × 3 locales)
--   product_images      ~28 000-42 000 lignes (2-3 images/produit)
--   product_variants    ~20 000-30 000 lignes
--   users               ~1 800 à migrer + nouveaux
-- ============================================================
-- Configuration MySQL recommandée pour ces volumes (my.cnf) :
--   innodb_buffer_pool_size = 512M   (cache InnoDB — clé de la performance)
--   innodb_buffer_pool_instances = 2
--   query_cache_type = 0             (désactivé — géré par node-cache)
--   max_connections = 100
--   innodb_file_per_table = ON
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- NETTOYAGE (ordre inverse des dépendances FK)
-- ============================================================
DROP TABLE IF EXISTS newsletter_subscribers;
DROP TABLE IF EXISTS wishlists;
DROP TABLE IF EXISTS consent_logs;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS loyalty_transactions;
DROP TABLE IF EXISTS loyalty_rewards;
DROP TABLE IF EXISTS loyalty_accounts;
DROP TABLE IF EXISTS loyalty_tiers;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS shipping_rates;
DROP TABLE IF EXISTS shipping_zones;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS cart_items;
DROP TABLE IF EXISTS carts;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS product_translations;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS category_translations;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS tax_rates;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- UTILISATEURS
-- ============================================================
CREATE TABLE users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255)    NOT NULL,
  password_hash VARCHAR(255)    NULL DEFAULT NULL,
  first_name    VARCHAR(100)    NOT NULL,
  last_name     VARCHAR(100)    NOT NULL,
  role          ENUM('client', 'admin') NOT NULL DEFAULT 'client',
  locale        ENUM('fr', 'de', 'en') NOT NULL DEFAULT 'fr',
  google_id     VARCHAR(255)    NULL DEFAULT NULL,
  avatar_url    VARCHAR(500)    NULL DEFAULT NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  -- Vérification email (double opt-in non bloquant) — NULL = non vérifié
  email_verified_at    DATETIME    NULL DEFAULT NULL,
  verify_token_hash    VARCHAR(64) NULL DEFAULT NULL,
  verify_token_expires DATETIME    NULL DEFAULT NULL,
  deleted_at    DATETIME        NULL DEFAULT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_google   (google_id),
  INDEX idx_users_role         (role),
  INDEX idx_users_deleted      (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ADRESSES
-- ============================================================
CREATE TABLE addresses (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  label      VARCHAR(100) NOT NULL DEFAULT 'Domicile',
  -- Type d'usage : livraison, facturation, ou les deux
  address_type ENUM('shipping', 'billing', 'both') NOT NULL DEFAULT 'both',
  -- Nom propre optionnel (facturation à un tiers/entreprise) — sinon celui du compte
  first_name VARCHAR(100) NULL DEFAULT NULL,
  last_name  VARCHAR(100) NULL DEFAULT NULL,
  street     VARCHAR(255) NOT NULL,
  city       VARCHAR(100) NOT NULL,
  zip        VARCHAR(10)  NOT NULL,
  country    CHAR(2)      NOT NULL DEFAULT 'CH',
  canton     CHAR(2)      NULL DEFAULT NULL,
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_addresses_user (user_id),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MFA (AUTHENTIFICATION À DEUX FACTEURS) — ADMIN
-- ============================================================
-- Obligatoire pour le rôle admin, non concerné pour client.
-- Secret TOTP chiffré (AES-256-GCM) — jamais en clair, jamais haché : contrairement
-- à un mot de passe, il doit rester déchiffrable pour recalculer le code attendu.
CREATE TABLE user_mfa (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  secret_encrypted    VARBINARY(255) NOT NULL,
  secret_iv           VARBINARY(16)  NOT NULL,
  secret_auth_tag     VARBINARY(16)  NOT NULL,
  -- NULL tant que le premier code TOTP n'a pas été confirmé (setup en cours)
  enabled_at          DATETIME NULL DEFAULT NULL,
  last_used_at        DATETIME NULL DEFAULT NULL,
  failed_attempts     INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME NULL DEFAULT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_mfa_user (user_id),
  CONSTRAINT fk_user_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codes de récupération à usage unique — hachés bcrypt (comme un mot de passe),
-- une ligne par code pour permettre l'invalidation individuelle.
CREATE TABLE user_mfa_recovery_codes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  used_at     DATETIME NULL DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_recovery_user_unused (user_id, used_at),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FOURNISSEURS
-- ============================================================
CREATE TABLE suppliers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NULL DEFAULT NULL,
  email        VARCHAR(255) NULL DEFAULT NULL,
  phone        VARCHAR(50)  NULL DEFAULT NULL,
  address      TEXT         NULL DEFAULT NULL,
  notes        TEXT         NULL DEFAULT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_suppliers_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TVA SUISSE
-- ============================================================
CREATE TABLE tax_rates (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100)   NOT NULL,
  rate       DECIMAL(5, 2)  NOT NULL,
  category   VARCHAR(50)    NOT NULL,
  is_default TINYINT(1)     NOT NULL DEFAULT 0,
  updated_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CATÉGORIES
-- ============================================================
CREATE TABLE categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id  INT UNSIGNED NULL DEFAULT NULL,
  slug       VARCHAR(255) NOT NULL,
  image_url  VARCHAR(500) NULL DEFAULT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  INDEX idx_categories_parent (parent_id),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE category_translations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  locale      ENUM('fr', 'de', 'en') NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cat_trans_locale (category_id, locale),
  INDEX idx_cat_trans_category (category_id),
  CONSTRAINT fk_cat_trans_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PRODUITS
-- ============================================================
CREATE TABLE products (
  id                INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  category_id       INT UNSIGNED   NOT NULL,
  supplier_id       INT UNSIGNED   NULL DEFAULT NULL,
  slug              VARCHAR(255)   NOT NULL,
  price_chf         DECIMAL(10, 2) NOT NULL,
  compare_price_chf DECIMAL(10, 2) NULL DEFAULT NULL,
  tax_rate_id       INT UNSIGNED   NOT NULL,
  sku               VARCHAR(100)   NULL DEFAULT NULL,
  stock             INT            NOT NULL DEFAULT 0,
  weight_kg         DECIMAL(8, 3)  NULL DEFAULT NULL,
  is_active         TINYINT(1)     NOT NULL DEFAULT 1,
  is_featured       TINYINT(1)     NOT NULL DEFAULT 0,
  is_made_to_order  TINYINT(1)     NOT NULL DEFAULT 0,  -- Produit sur commande : commande possible sans stock (délai 3 à 4 semaines)
  badge             ENUM('nouveaute','promo','coup_de_coeur','exclusif') NULL DEFAULT NULL,
  deleted_at        DATETIME       NULL DEFAULT NULL,
  created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  UNIQUE KEY uq_products_sku (sku),
  -- Index simples
  INDEX idx_products_category    (category_id),
  INDEX idx_products_supplier    (supplier_id),
  INDEX idx_products_deleted     (deleted_at),
  -- Index composites pour les requêtes de catalogue les plus fréquentes
  INDEX idx_products_active_cat  (is_active, category_id),           -- filtre catégorie actif
  INDEX idx_products_active_feat (is_active, is_featured),           -- page accueil / featured
  INDEX idx_products_active_price(is_active, price_chf),             -- tri par prix
  INDEX idx_products_stock       (is_active, stock),                 -- filtre in_stock
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
  CONSTRAINT fk_products_tax      FOREIGN KEY (tax_rate_id) REFERENCES tax_rates (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_translations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  INT UNSIGNED NOT NULL,
  locale      ENUM('fr', 'de', 'en') NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL DEFAULT NULL,
  slug        VARCHAR(255) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prod_trans_locale      (product_id, locale),
  UNIQUE KEY uq_prod_trans_slug_locale (slug, locale),
  -- Index composite locale+product_id : requête la plus fréquente (chercher par locale)
  INDEX idx_prod_trans_locale_product  (locale, product_id),
  -- FULLTEXT combiné nom+description par locale pour la recherche plein texte
  -- Un seul index FULLTEXT couvrant les deux colonnes est plus efficace que deux séparés
  FULLTEXT INDEX idx_ft_prod_name_desc (name, description),
  CONSTRAINT fk_prod_trans_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  url        VARCHAR(500) NOT NULL,
  -- 3 tailles générées par sharp à l'upload (WebP) — voir CLAUDE.md §10
  url_thumbnail VARCHAR(500) NULL DEFAULT NULL,
  url_medium    VARCHAR(500) NULL DEFAULT NULL,
  url_large     VARCHAR(500) NULL DEFAULT NULL,
  alt        VARCHAR(255) NULL DEFAULT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_primary TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  -- Index composite : récupérer image primaire d'un produit en une seule lookup
  INDEX idx_prod_images_primary (product_id, is_primary),
  CONSTRAINT fk_prod_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_variants (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  product_id     INT UNSIGNED   NOT NULL,
  name           VARCHAR(100)   NOT NULL,
  value          VARCHAR(100)   NOT NULL,
  price_modifier DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  stock          INT            NOT NULL DEFAULT 0,
  sku        VARCHAR(100)   NULL DEFAULT NULL,
  updated_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_prod_variants_product (product_id),
  CONSTRAINT fk_prod_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PANIER
-- ============================================================
CREATE TABLE carts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL DEFAULT NULL,
  session_id VARCHAR(255) NULL DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_carts_user (user_id),
  INDEX idx_carts_session (session_id),
  CONSTRAINT fk_carts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cart_items (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  cart_id          INT UNSIGNED   NOT NULL,
  product_id       INT UNSIGNED   NOT NULL,
  variant_id       INT UNSIGNED   NULL DEFAULT NULL,
  quantity         INT UNSIGNED   NOT NULL DEFAULT 1,
  price_snapshot   DECIMAL(10, 2) NOT NULL,
  tax_rate_snapshot DECIMAL(5, 2) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_cart_items_cart (cart_id),
  INDEX idx_cart_items_product (product_id),
  CONSTRAINT fk_cart_items_cart    FOREIGN KEY (cart_id)   REFERENCES carts (id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMMANDES
-- ============================================================
CREATE TABLE orders (
  id              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED   NOT NULL,
  status          ENUM('pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
  subtotal        DECIMAL(10, 2) NOT NULL,
  discount        DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  coupon_code     VARCHAR(50)    NULL DEFAULT NULL,
  shipping_cost   DECIMAL(10, 2) NOT NULL,
  tax_amount      DECIMAL(10, 2) NOT NULL,
  total           DECIMAL(10, 2) NOT NULL,
  -- Référence de paiement QR figée (facture QR suisse) — sert à régénérer le PDF et rapprocher le paiement
  qr_reference    VARCHAR(27)    NULL DEFAULT NULL,
  -- Adresse de livraison figée au moment de la commande (noms inclus — destinataire réel)
  shipping_first_name VARCHAR(100) NULL DEFAULT NULL,
  shipping_last_name  VARCHAR(100) NULL DEFAULT NULL,
  shipping_street  VARCHAR(255)   NULL DEFAULT NULL,
  shipping_city    VARCHAR(100)   NULL DEFAULT NULL,
  shipping_zip     VARCHAR(10)    NULL DEFAULT NULL,
  shipping_country CHAR(2)        NULL DEFAULT 'CH',
  shipping_canton  CHAR(2)        NULL DEFAULT NULL,
  -- Adresse de facturation figée (peut différer de la livraison — tiers, entreprise…)
  billing_first_name VARCHAR(100) NULL DEFAULT NULL,
  billing_last_name  VARCHAR(100) NULL DEFAULT NULL,
  billing_street   VARCHAR(255)   NULL DEFAULT NULL,
  billing_city     VARCHAR(100)   NULL DEFAULT NULL,
  billing_zip      VARCHAR(10)    NULL DEFAULT NULL,
  billing_country  CHAR(2)        NULL DEFAULT 'CH',
  billing_canton   CHAR(2)        NULL DEFAULT NULL,
  tracking_number  VARCHAR(100)   NULL DEFAULT NULL,
  label_url        VARCHAR(500)   NULL DEFAULT NULL,
  label_id         VARCHAR(100)   NULL DEFAULT NULL,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id                   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  order_id             INT UNSIGNED   NOT NULL,
  product_id           INT UNSIGNED   NOT NULL,
  variant_id           INT UNSIGNED   NULL DEFAULT NULL,
  quantity              INT UNSIGNED   NOT NULL,
  unit_price            DECIMAL(10, 2) NOT NULL,
  tax_rate_snapshot     DECIMAL(5, 2)  NOT NULL,
  product_snapshot_json JSON           NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order   FOREIGN KEY (order_id)  REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_history (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   INT UNSIGNED NOT NULL,
  status     ENUM('pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL,
  note       TEXT         NULL DEFAULT NULL,
  created_by INT UNSIGNED NULL DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_history_order (order_id),
  CONSTRAINT fk_order_history_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_history_user  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAIEMENTS
-- ============================================================
CREATE TABLE payments (
  id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  order_id            INT UNSIGNED   NOT NULL,
  provider            VARCHAR(50)    NOT NULL DEFAULT 'stripe',
  provider_payment_id VARCHAR(255)   NULL DEFAULT NULL,
  amount              DECIMAL(10, 2) NOT NULL,
  currency            CHAR(3)        NOT NULL DEFAULT 'CHF',
  method              ENUM('card', 'twint', 'invoice_qr', 'pickup') NOT NULL,
  status              ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_payments_order (order_id),
  INDEX idx_payments_status (status),
  INDEX idx_payments_provider_id (provider_payment_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LIVRAISON
-- ============================================================
CREATE TABLE shipping_zones (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(100) NOT NULL,
  carrier        VARCHAR(100) NOT NULL DEFAULT 'Swiss Post',
  estimated_days VARCHAR(20)  NOT NULL DEFAULT '1-2',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipping_rates (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  zone_id        INT UNSIGNED   NOT NULL,
  name           VARCHAR(100)   NOT NULL,
  min_weight     DECIMAL(8, 3)  NOT NULL DEFAULT 0.000,
  max_weight     DECIMAL(8, 3)  NOT NULL,
  price_chf      DECIMAL(10, 2) NOT NULL,
  estimated_days VARCHAR(20)    NULL DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_shipping_rates_zone (zone_id),
  CONSTRAINT fk_shipping_rates_zone   FOREIGN KEY (zone_id) REFERENCES shipping_zones (id) ON DELETE CASCADE,
  CONSTRAINT chk_shipping_weight      CHECK (min_weight < max_weight)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PROMOTIONS
-- ============================================================
CREATE TABLE coupons (
  id            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  code          VARCHAR(50)    NOT NULL,
  type          ENUM('percent', 'fixed') NOT NULL,
  value         DECIMAL(10, 2) NOT NULL,
  min_order_chf DECIMAL(10, 2) NULL DEFAULT NULL,
  usage_limit   INT UNSIGNED   NULL DEFAULT NULL,
  used_count    INT UNSIGNED   NOT NULL DEFAULT 0,
  expires_at    DATETIME       NULL DEFAULT NULL,
  is_active     TINYINT(1)     NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code),
  INDEX idx_coupons_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PROGRAMME DE FIDÉLITÉ
-- ============================================================
CREATE TABLE loyalty_tiers (
  id                   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(100)   NOT NULL,
  min_spend_chf        DECIMAL(10, 2) NOT NULL,
  reward_type          ENUM('fixed', 'percent') NOT NULL,
  reward_value         DECIMAL(10, 2) NOT NULL,
  reward_validity_days INT UNSIGNED   NOT NULL DEFAULT 90,
  is_active            TINYINT(1)     NOT NULL DEFAULT 1,
  sort_order           INT UNSIGNED   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_loyalty_tiers_active (is_active),
  INDEX idx_loyalty_tiers_spend (min_spend_chf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loyalty_accounts (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED   NOT NULL,
  total_spend_chf  DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  current_tier_id  INT UNSIGNED   NULL DEFAULT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loyalty_accounts_user (user_id),
  INDEX idx_loyalty_accounts_tier (current_tier_id),
  CONSTRAINT fk_loyalty_accounts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_loyalty_accounts_tier FOREIGN KEY (current_tier_id) REFERENCES loyalty_tiers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loyalty_rewards (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED   NOT NULL,
  tier_id    INT UNSIGNED   NOT NULL,
  code       VARCHAR(50)    NOT NULL,
  type       ENUM('fixed', 'percent') NOT NULL,
  value      DECIMAL(10, 2) NOT NULL,
  status     ENUM('pending', 'available', 'used', 'expired') NOT NULL DEFAULT 'available',
  expires_at DATETIME       NULL DEFAULT NULL,
  created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loyalty_rewards_code (code),
  INDEX idx_loyalty_rewards_user (user_id),
  INDEX idx_loyalty_rewards_status (status),
  CONSTRAINT fk_loyalty_rewards_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_loyalty_rewards_tier FOREIGN KEY (tier_id) REFERENCES loyalty_tiers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loyalty_transactions (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED   NOT NULL,
  order_id   INT UNSIGNED   NULL DEFAULT NULL,
  amount_chf DECIMAL(10, 2) NOT NULL,
  type       ENUM('earn', 'redeem', 'refund') NOT NULL,
  created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_loyalty_tx_user (user_id),
  INDEX idx_loyalty_tx_order (order_id),
  CONSTRAINT fk_loyalty_tx_user  FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_loyalty_tx_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AVIS CLIENTS
-- ============================================================
CREATE TABLE reviews (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  rating      TINYINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       VARCHAR(255) NULL DEFAULT NULL,
  body        TEXT         NULL DEFAULT NULL,
  is_approved TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_reviews_product (product_id),
  INDEX idx_reviews_user (user_id),
  INDEX idx_reviews_approved (is_approved),
  CONSTRAINT fk_reviews_user    FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- WISHLIST
-- ============================================================
CREATE TABLE wishlists (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlist_user_product (user_id, product_id),
  INDEX idx_wishlist_user (user_id),
  CONSTRAINT fk_wishlist_user    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NEWSLETTER
-- ============================================================
CREATE TABLE newsletter_subscribers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email        VARCHAR(255) NOT NULL,
  locale       ENUM('fr', 'de', 'en') NOT NULL DEFAULT 'fr',
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  subscribed_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME  NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_newsletter_email (email),
  INDEX idx_newsletter_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CONFORMITÉ LPD
-- ============================================================
CREATE TABLE consent_logs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL DEFAULT NULL,
  session_id  VARCHAR(255) NOT NULL,
  type        VARCHAR(50)  NOT NULL,
  version     VARCHAR(20)  NOT NULL,
  ip_hash     CHAR(64)     NOT NULL,
  accepted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_consent_user (user_id),
  INDEX idx_consent_session (session_id),
  CONSTRAINT fk_consent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DONNÉES DE RÉFÉRENCE — TVA SUISSE
-- ============================================================
INSERT INTO tax_rates (name, rate, category, is_default) VALUES
  ('Taux normal',  8.1, 'standard', 1),
  ('Taux réduit',  2.6, 'reduced',  0),
  ('Taux hôtelier', 3.8, 'hotel',   0);

-- ============================================================
-- DONNÉES DE RÉFÉRENCE — LIVRAISON SUISSE
-- ============================================================
INSERT INTO shipping_zones (name, carrier, estimated_days) VALUES
  ('Suisse', 'Swiss Post', '1-2');

INSERT INTO shipping_rates (zone_id, name, min_weight, max_weight, price_chf, estimated_days) VALUES
  (1, 'Lettre A (jusqu\'à 100g)',   0.000, 0.100,  1.90, '1-2'),
  (1, 'Colis S (jusqu\'à 2kg)',     0.100, 2.000,  8.50, '1-2'),
  (1, 'Colis M (jusqu\'à 10kg)',    2.000, 10.000, 14.00, '1-2'),
  (1, 'Colis L (jusqu\'à 30kg)',   10.000, 30.000, 22.00, '2-3');

-- ============================================================
-- OPTIMISATION APRÈS IMPORT EN MASSE (14 000 produits)
-- À exécuter UNE FOIS après chaque import CSV/migration
-- ============================================================

-- Reconstruction des index FULLTEXT après import en masse
-- (plus rapide que l'insertion index par index)
-- ALTER TABLE product_translations DROP INDEX idx_ft_prod_name_desc;
-- ALTER TABLE product_translations ADD FULLTEXT INDEX idx_ft_prod_name_desc (name, description);

-- Analyse des statistiques de tables pour l'optimiseur MySQL
-- ANALYZE TABLE products;
-- ANALYZE TABLE product_translations;
-- ANALYZE TABLE product_images;
-- ANALYZE TABLE product_variants;

-- Vérification santé des index après import (décommenter pour diagnostic)
-- SHOW INDEX FROM products;
-- SHOW INDEX FROM product_translations;
-- SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND is_active = 1;
-- SELECT COUNT(*) FROM product_translations WHERE locale = 'fr';

-- ============================================================
-- REQUÊTES DE DIAGNOSTIC PERFORMANCE (à valider avec EXPLAIN)
-- ============================================================

-- Requête type catalogue (la plus fréquente) — doit utiliser idx_products_active_cat
-- EXPLAIN SELECT p.id, p.slug, p.price_chf, p.stock, pt.name, pi.url
-- FROM products p
-- JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
-- LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
-- WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.category_id = 1
-- ORDER BY p.created_at DESC
-- LIMIT 20 OFFSET 0;

-- Requête recherche FULLTEXT — doit utiliser idx_ft_prod_name_desc
-- EXPLAIN SELECT p.id, pt.name, p.price_chf
-- FROM product_translations pt
-- JOIN products p ON p.id = pt.product_id
-- WHERE pt.locale = 'fr'
--   AND MATCH(pt.name, pt.description) AGAINST ('broderie' IN BOOLEAN MODE)
--   AND p.is_active = 1
-- LIMIT 20;
