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
DROP TABLE IF EXISTS product_tags;
DROP TABLE IF EXISTS tag_translations;
DROP TABLE IF EXISTS tags;
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
  street        VARCHAR(255) NOT NULL,
  street_number VARCHAR(20)  NULL DEFAULT NULL,
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
  -- Délai "sur commande" (produits is_made_to_order) propre à ce fournisseur, en semaines
  made_to_order_delay_min_weeks TINYINT UNSIGNED NULL DEFAULT NULL,
  made_to_order_delay_max_weeks TINYINT UNSIGNED NULL DEFAULT NULL,
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
-- PARAMÈTRES BOUTIQUE (clé/valeur)
-- ============================================================
CREATE TABLE settings (
  `key`      VARCHAR(100) NOT NULL,
  `value`    TEXT         NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (`key`, `value`) VALUES
  ('store_name',       'Broderie & Cie'),
  ('store_email',      ''),
  ('store_phone',      ''),
  ('store_address',    ''),
  ('cgv',              ''),
  ('mentions_legales', ''),
  ('politique_retour', '');

-- ============================================================
-- CATÉGORIES
-- Hiérarchie à 3 niveaux max (ex: BRODERIE > Kits de Broderie >
-- Point de croix compté), via parent_id auto-référencé. La
-- profondeur (3) est imposée côté application, pas en contrainte SQL.
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
  length_cm         DECIMAL(8, 2)  NULL DEFAULT NULL,
  width_cm          DECIMAL(8, 2)  NULL DEFAULT NULL,
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
-- TAGS (thèmes transversaux — ex: Noël, Animaux, Fleurs & Jardin)
-- Indépendants de la hiérarchie categories : un produit garde sa
-- catégorie (arbre à 3 niveaux max) ET peut porter plusieurs tags.
-- ============================================================
CREATE TABLE tags (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug       VARCHAR(255) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tag_translations (
  id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tag_id INT UNSIGNED NOT NULL,
  locale ENUM('fr', 'de', 'en') NOT NULL,
  name   VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tag_trans_locale (tag_id, locale),
  INDEX idx_tag_trans_tag (tag_id),
  CONSTRAINT fk_tag_trans_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_tags (
  product_id INT UNSIGNED NOT NULL,
  tag_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  INDEX idx_product_tags_tag (tag_id),
  CONSTRAINT fk_product_tags_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_tags_tag     FOREIGN KEY (tag_id)     REFERENCES tags (id) ON DELETE CASCADE
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
  shipping_street_number VARCHAR(20) NULL DEFAULT NULL,
  shipping_city    VARCHAR(100)   NULL DEFAULT NULL,
  shipping_zip     VARCHAR(10)    NULL DEFAULT NULL,
  shipping_country CHAR(2)        NULL DEFAULT 'CH',
  shipping_canton  CHAR(2)        NULL DEFAULT NULL,
  -- Adresse de facturation figée (peut différer de la livraison — tiers, entreprise…)
  billing_first_name VARCHAR(100) NULL DEFAULT NULL,
  billing_last_name  VARCHAR(100) NULL DEFAULT NULL,
  billing_street   VARCHAR(255)   NULL DEFAULT NULL,
  billing_street_number VARCHAR(20) NULL DEFAULT NULL,
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
-- DONNÉES DE RÉFÉRENCE — CATÉGORIES (hiérarchie à 3 niveaux)
-- Source : database/categorie.md (catalogue fourni par le client)
-- Traductions FR uniquement pour l'instant — DE/EN à compléter
-- via l'admin une fois les traductions fournies par le client.
-- ============================================================

-- Niveau 1 — catégories parentes (id 1-5)
-- Note : le bloc « Thème » de categorie.md n'est PAS une catégorie boutique —
-- il est modélisé uniquement via les tags transversaux ci-dessous.
INSERT INTO categories (id, parent_id, slug, sort_order) VALUES
  (1, NULL, 'broderie',            1),
  (2, NULL, 'fils-a-broder',       2),
  (3, NULL, 'toiles-et-supports',  3),
  (4, NULL, 'accessoires-et-outils', 4),
  (5, NULL, 'loisirs-et-strass',   5);

INSERT INTO category_translations (category_id, locale, name) VALUES
  (1, 'fr', 'Broderie'),
  (2, 'fr', 'Fils à broder'),
  (3, 'fr', 'Toiles & Supports'),
  (4, 'fr', 'Accessoires & Outils'),
  (5, 'fr', 'Loisirs & Strass');

-- Niveau 2 — sous-catégories (id 101+, parent = niveau 1)
INSERT INTO categories (id, parent_id, slug, sort_order) VALUES
  (101, 1, 'kits-de-broderie',        1),
  (102, 1, 'canevas-et-coussins',     2),
  (103, 1, 'grilles-et-modeles',      3),
  (104, 1, 'kits-enfants',            4),
  (105, 2, 'fils-coton',              1),
  (106, 2, 'fils-effets-speciaux',    2),
  (107, 2, 'autres-fils',             3),
  (108, 3, 'toiles-au-metre-et-coupons', 1),
  (109, 3, 'bandes-et-galons',        2),
  (110, 3, 'articles-prets-a-broder', 3),
  (111, 4, 'aiguilles-et-rangement',  1),
  (112, 4, 'tambours-et-cadres',      2),
  (113, 4, 'confort-et-optique',      3),
  (114, 4, 'petite-mercerie',         4),
  (115, 5, 'broderie-diamant',        1),
  (116, 5, 'perles-et-tresors',       2);

INSERT INTO category_translations (category_id, locale, name) VALUES
  (101, 'fr', 'Kits de Broderie'),
  (102, 'fr', 'Canevas & Coussins'),
  (103, 'fr', 'Grilles & Modèles'),
  (104, 'fr', 'Kits Enfants'),
  (105, 'fr', 'Fils Coton'),
  (106, 'fr', 'Fils Effets Spéciaux'),
  (107, 'fr', 'Autres Fils'),
  (108, 'fr', 'Toiles au mètre & Coupons'),
  (109, 'fr', 'Bandes & Galons'),
  (110, 'fr', 'Articles Prêts à Broder'),
  (111, 'fr', 'Aiguilles & Rangement'),
  (112, 'fr', 'Tambours & Cadres'),
  (113, 'fr', 'Confort & Optique'),
  (114, 'fr', 'Petite Mercerie'),
  (115, 'fr', 'Broderie Diamant'),
  (116, 'fr', 'Perles & Trésors');

-- Niveau 3 — catégories enfant (id 1001+, parent = niveau 2)
-- Extrait des items séparés par « • » dans categorie.md
INSERT INTO categories (id, parent_id, slug, sort_order) VALUES
  -- Kits de Broderie (101)
  (1001, 101, 'point-de-croix-compte',              1),
  (1002, 101, 'broderie-traditionnelle-points-lances', 2),
  -- Canevas & Coussins (102)
  (1003, 102, 'canevas-peints',                     1),
  (1004, 102, 'coussins-et-tapis',                  2),
  -- Grilles & Modèles (103)
  (1005, 103, 'fiches-point-compte',                1),
  (1006, 103, 'livres-et-magazines',                2),
  -- Kits Enfants (104)
  (1007, 104, 'premiers-canevas',                   1),
  (1008, 104, 'points-de-croix-et-broderie-imprimee-enfants', 2),
  -- Fils Coton (105)
  (1009, 105, 'mouline-special-art-117',            1),
  (1010, 105, 'coton-retors-et-colbert-tapisserie', 2),
  -- Fils Effets Spéciaux (106)
  (1011, 106, 'fils-metallises-etoile-et-satin',    1),
  (1012, 106, 'fils-variations-et-coloris',         2),
  -- Toiles au mètre & Coupons (108)
  (1013, 108, 'toiles-aida',                        1),
  (1014, 108, 'toiles-de-lin',                      2),
  (1015, 108, 'eglantine-etamine-et-trames-diverses', 3),
  -- Bandes & Galons (109)
  (1016, 109, 'bandes-aida-a-broder',                1),
  (1017, 109, 'bandes-en-lin-a-broder',              2),
  (1018, 109, 'galons-decoratifs-a-motifs',          3),
  -- Articles Prêts à Broder (110)
  (1019, 110, 'univers-bebe',                        1),
  (1020, 110, 'cuisine-et-maison',                   2),
  (1021, 110, 'linge-de-bain',                       3),
  -- Aiguilles & Rangement (111)
  (1022, 111, 'aiguilles-coudre-broder',             1),
  (1023, 111, 'boites-organiseurs-et-tri-fils',      2),
  -- Tambours & Cadres (112)
  (1024, 112, 'tambours-et-metiers-a-broder',        1),
  (1025, 112, 'cadres-et-suspenses-de-finition',     2),
  -- Confort & Optique (113)
  (1026, 113, 'lampes-lumiere-du-jour',              1),
  (1027, 113, 'loupes-de-broderie',                  2),
  -- Petite Mercerie (114)
  (1028, 114, 'ciseaux-de-broderie',                 1),
  (1029, 114, 'bons-cadeaux-et-accessoires-divers',  2),
  -- Broderie Diamant (115)
  (1030, 115, 'kits-diamants-adultes',               1),
  (1031, 115, 'magnets-et-autocollants-enfants',     2),
  -- Perles & Trésors (116)
  (1032, 116, 'perles-mill-hill-et-accessoires',     1),
  (1033, 116, 'kits-de-broderie-perlee',             2);

INSERT INTO category_translations (category_id, locale, name) VALUES
  (1001, 'fr', 'Point de croix compté'),
  (1002, 'fr', 'Broderie traditionnelle & Points lancés'),
  (1003, 'fr', 'Canevas peints'),
  (1004, 'fr', 'Coussins & Tapis'),
  (1005, 'fr', 'Fiches Point Compté'),
  (1006, 'fr', 'Livres & Magazines'),
  (1007, 'fr', 'Premiers canevas'),
  (1008, 'fr', 'Points de croix & Broderie imprimée enfants'),
  (1009, 'fr', 'Mouliné Spécial (Art. 117)'),
  (1010, 'fr', 'Coton Retors & Colbert (Tapisserie)'),
  (1011, 'fr', 'Fils Métallisés, Étoile & Satin'),
  (1012, 'fr', 'Fils Variations & Coloris'),
  (1013, 'fr', 'Toiles Aïda'),
  (1014, 'fr', 'Toiles de Lin'),
  (1015, 'fr', 'Églantine, Étamine & Trames diverses'),
  (1016, 'fr', 'Bandes Aïda à broder'),
  (1017, 'fr', 'Bandes en Lin à broder'),
  (1018, 'fr', 'Galons décoratifs à motifs'),
  (1019, 'fr', 'Univers Bébé (Doudous, bavoirs...)'),
  (1020, 'fr', 'Cuisine & Maison (Nappes, tabliers...)'),
  (1021, 'fr', 'Linge de Bain (Essuie-mains, éponges...)'),
  (1022, 'fr', 'Aiguilles (Coudre / Broder)'),
  (1023, 'fr', 'Boîtes, organiseurs & tri-fils'),
  (1024, 'fr', 'Tambours & Métiers à broder'),
  (1025, 'fr', 'Cadres & Suspenses de finition'),
  (1026, 'fr', 'Lampes lumière du jour'),
  (1027, 'fr', 'Loupes de broderie'),
  (1028, 'fr', 'Ciseaux de broderie'),
  (1029, 'fr', 'Bons cadeaux & Accessoires divers'),
  (1030, 'fr', 'Kits Diamants Adultes'),
  (1031, 'fr', 'Magnets & Autocollants Enfants'),
  (1032, 'fr', 'Perles Mill Hill & Accessoires'),
  (1033, 'fr', 'Kits de Broderie Perlée');

-- Descriptions FR des catégories — affichées sur la page produit, au-dessus des avis
-- clients (CategoryInfoSection.jsx). Rédigées par niveau : niveau 1 = large/inspirant,
-- niveau 3 = précis/technique.
UPDATE category_translations SET description = 'Kits, canevas, grilles et modèles pour tous les niveaux — de la première broderie aux ouvrages les plus experts.' WHERE category_id = 1 AND locale = 'fr';
UPDATE category_translations SET description = 'Fils coton, effets spéciaux et fils techniques pour donner vie à chaque point, dans toutes les nuances.' WHERE category_id = 2 AND locale = 'fr';
UPDATE category_translations SET description = 'Toiles, bandes et articles prêts à broder — le support idéal pour chaque projet, du plus simple au plus raffiné.' WHERE category_id = 3 AND locale = 'fr';
UPDATE category_translations SET description = 'Aiguilles, tambours, loupes et petite mercerie pour broder dans les meilleures conditions, du confort à la précision.' WHERE category_id = 4 AND locale = 'fr';
UPDATE category_translations SET description = 'Broderie diamant et perles à broder — des loisirs créatifs scintillants pour petits et grands.' WHERE category_id = 5 AND locale = 'fr';
UPDATE category_translations SET description = 'Tout le nécessaire réuni en un seul kit — toile, fils et modèle — pour se lancer sans rien acheter d\'autre.' WHERE category_id = 101 AND locale = 'fr';
UPDATE category_translations SET description = 'Canevas déjà peints et coussins à broder, pour des projets décoratifs qui prennent forme rapidement.' WHERE category_id = 102 AND locale = 'fr';
UPDATE category_translations SET description = 'Fiches techniques, livres et magazines pour puiser dans de nouveaux motifs et progresser point par point.' WHERE category_id = 103 AND locale = 'fr';
UPDATE category_translations SET description = 'Des kits pensés pour les petites mains — simples, ludiques et parfaits pour une première initiation.' WHERE category_id = 104 AND locale = 'fr';
UPDATE category_translations SET description = 'Le mouliné et les fils retors classiques, dans une large palette de coloris pour tous les points de croix.' WHERE category_id = 105 AND locale = 'fr';
UPDATE category_translations SET description = 'Fils métallisés, satinés ou dégradés pour apporter éclat et relief à vos broderies les plus soignées.' WHERE category_id = 106 AND locale = 'fr';
UPDATE category_translations SET description = 'Une sélection de fils spécifiques — mohair, laine et autres matières — pour des effets de texture uniques.' WHERE category_id = 107 AND locale = 'fr';
UPDATE category_translations SET description = 'Toiles vendues au mètre ou en coupons, à choisir selon la taille et le tombé de votre ouvrage.' WHERE category_id = 108 AND locale = 'fr';
UPDATE category_translations SET description = 'Bandes et galons à broder pour personnaliser linge de maison, cadres et finitions avec élégance.' WHERE category_id = 109 AND locale = 'fr';
UPDATE category_translations SET description = 'Des articles déjà confectionnés — bavoirs, nappes, essuie-mains — prêts à recevoir votre broderie.' WHERE category_id = 110 AND locale = 'fr';
UPDATE category_translations SET description = 'Aiguilles adaptées à chaque technique et solutions de rangement pour garder fils et outils bien organisés.' WHERE category_id = 111 AND locale = 'fr';
UPDATE category_translations SET description = 'Tambours, métiers et cadres de finition pour tendre parfaitement votre toile et présenter votre ouvrage.' WHERE category_id = 112 AND locale = 'fr';
UPDATE category_translations SET description = 'Lampes à lumière du jour et loupes de broderie pour préserver vos yeux durant les longues séances.' WHERE category_id = 113 AND locale = 'fr';
UPDATE category_translations SET description = 'Ciseaux de précision et petits accessoires indispensables au quotidien de toute brodeuse.' WHERE category_id = 114 AND locale = 'fr';
UPDATE category_translations SET description = 'Des kits diamants scintillants pour adultes, à composer strass par strass pour un résultat éclatant.' WHERE category_id = 115 AND locale = 'fr';
UPDATE category_translations SET description = 'Perles Mill Hill et kits de broderie perlée pour ajouter éclat et relief à vos créations.' WHERE category_id = 116 AND locale = 'fr';
UPDATE category_translations SET description = 'La technique reine du point de croix, comptée sur toile pour un résultat régulier et précis.' WHERE category_id = 1001 AND locale = 'fr';
UPDATE category_translations SET description = 'Points lancés et techniques traditionnelles pour des broderies riches en relief et en texture.' WHERE category_id = 1002 AND locale = 'fr';
UPDATE category_translations SET description = 'Des canevas déjà peints, prêts à broder au point de tapisserie sans transfert de motif.' WHERE category_id = 1003 AND locale = 'fr';
UPDATE category_translations SET description = 'Coussins et tapis à broder pour habiller votre intérieur d\'une touche faite main.' WHERE category_id = 1004 AND locale = 'fr';
UPDATE category_translations SET description = 'Des fiches détaillées, grille et nuancier inclus, pour reproduire fidèlement chaque modèle.' WHERE category_id = 1005 AND locale = 'fr';
UPDATE category_translations SET description = 'Livres et magazines spécialisés pour s\'inspirer et découvrir de nouvelles techniques.' WHERE category_id = 1006 AND locale = 'fr';
UPDATE category_translations SET description = 'Les tout premiers canevas, simples et colorés, pour une initiation en douceur.' WHERE category_id = 1007 AND locale = 'fr';
UPDATE category_translations SET description = 'Toile pré-imprimée et fils assortis pour que les enfants brodent facilement leurs premiers motifs.' WHERE category_id = 1008 AND locale = 'fr';
UPDATE category_translations SET description = 'Le mouliné DMC référence, décliné dans des centaines de coloris pour tous vos points de croix.' WHERE category_id = 1009 AND locale = 'fr';
UPDATE category_translations SET description = 'Fils retors et coton Colbert pour la tapisserie sur canevas et les ouvrages à gros points.' WHERE category_id = 1010 AND locale = 'fr';
UPDATE category_translations SET description = 'Fils métallisés, effet étoile ou satiné pour des broderies qui accrochent la lumière.' WHERE category_id = 1011 AND locale = 'fr';
UPDATE category_translations SET description = 'Fils dégradés et effets de coloris variés pour des transitions de teintes naturelles.' WHERE category_id = 1012 AND locale = 'fr';
UPDATE category_translations SET description = 'La toile Aïda, la plus utilisée en point de croix, disponible dans plusieurs comptages.' WHERE category_id = 1013 AND locale = 'fr';
UPDATE category_translations SET description = 'Toiles de lin naturelles pour des broderies traditionnelles au rendu authentique.' WHERE category_id = 1014 AND locale = 'fr';
UPDATE category_translations SET description = 'Églantine, étamine et autres trames spécifiques pour des projets et techniques particulières.' WHERE category_id = 1015 AND locale = 'fr';
UPDATE category_translations SET description = 'Bandes en toile Aïda, idéales pour border serviettes, nappes et linge de maison.' WHERE category_id = 1016 AND locale = 'fr';
UPDATE category_translations SET description = 'Bandes en lin à broder pour une finition élégante sur vos ouvrages textiles.' WHERE category_id = 1017 AND locale = 'fr';
UPDATE category_translations SET description = 'Galons décoratifs à motifs pour agrémenter et personnaliser vos créations en un geste.' WHERE category_id = 1018 AND locale = 'fr';
UPDATE category_translations SET description = 'Doudous, bavoirs et petits articles à broder pour célébrer une naissance avec douceur.' WHERE category_id = 1019 AND locale = 'fr';
UPDATE category_translations SET description = 'Nappes, tabliers et linge de cuisine à personnaliser pour une maison qui vous ressemble.' WHERE category_id = 1020 AND locale = 'fr';
UPDATE category_translations SET description = 'Essuie-mains et éponges à broder pour une salle de bain soignée jusque dans le détail.' WHERE category_id = 1021 AND locale = 'fr';
UPDATE category_translations SET description = 'Aiguilles à coudre et à broder adaptées à chaque type de toile et de fil.' WHERE category_id = 1022 AND locale = 'fr';
UPDATE category_translations SET description = 'Boîtes de rangement et organiseurs de fils pour garder votre matériel toujours à portée de main.' WHERE category_id = 1023 AND locale = 'fr';
UPDATE category_translations SET description = 'Tambours et métiers à broder pour tendre parfaitement la toile pendant le travail.' WHERE category_id = 1024 AND locale = 'fr';
UPDATE category_translations SET description = 'Cadres et suspenses pour présenter et encadrer votre ouvrage une fois terminé.' WHERE category_id = 1025 AND locale = 'fr';
UPDATE category_translations SET description = 'Lampes à lumière du jour pour broder avec un éclairage fidèle, de jour comme de nuit.' WHERE category_id = 1026 AND locale = 'fr';
UPDATE category_translations SET description = 'Loupes de broderie pour un confort visuel optimal sur les travaux les plus minutieux.' WHERE category_id = 1027 AND locale = 'fr';
UPDATE category_translations SET description = 'Des ciseaux fins et précis, indispensables pour couper fils et tissus sans effort.' WHERE category_id = 1028 AND locale = 'fr';
UPDATE category_translations SET description = 'Bons cadeaux et petits accessoires variés pour compléter votre trousse de broderie.' WHERE category_id = 1029 AND locale = 'fr';
UPDATE category_translations SET description = 'Des kits diamants pensés pour les adultes, avec motifs élaborés et grande précision.' WHERE category_id = 1030 AND locale = 'fr';
UPDATE category_translations SET description = 'Magnets et autocollants en diamants, un loisir créatif rapide et ludique pour les enfants.' WHERE category_id = 1031 AND locale = 'fr';
UPDATE category_translations SET description = 'Perles Mill Hill et accessoires assortis pour enrichir vos broderies de reflets précieux.' WHERE category_id = 1032 AND locale = 'fr';
UPDATE category_translations SET description = 'Des kits complets de broderie perlée, pour des créations scintillantes du fil à la finition.' WHERE category_id = 1033 AND locale = 'fr';

-- Auto-increment repositionné après les id explicites ci-dessus
ALTER TABLE categories AUTO_INCREMENT = 2000;

-- ============================================================
-- DONNÉES DE RÉFÉRENCE — TAGS (thèmes transversaux, many-to-many)
-- Le bloc « Thème » de categorie.md n'est pas une catégorie : un
-- produit peut cumuler plusieurs thèmes en plus de sa catégorie.
-- ============================================================
INSERT INTO tags (id, slug, sort_order) VALUES
  (1, 'noel',            1),
  (2, 'animaux',         2),
  (3, 'fleurs-et-jardin', 3),
  (4, 'bebe-et-enfants', 4),
  (5, 'cuisine-et-maison', 5),
  (6, 'nature-et-mer',   6);

INSERT INTO tag_translations (tag_id, locale, name) VALUES
  (1, 'fr', 'Noël'),
  (2, 'fr', 'Animaux'),
  (3, 'fr', 'Fleurs & Jardin'),
  (4, 'fr', 'Bébé & Enfants'),
  (5, 'fr', 'Cuisine & Maison'),
  (6, 'fr', 'Nature & Mer');

ALTER TABLE tags AUTO_INCREMENT = 100;

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
