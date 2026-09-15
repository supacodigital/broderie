-- ============================================================
-- Migration : fenêtre de validité des promotions produit
-- Date       : 2026-09-15
-- Contexte   : demande cliente — un produit avec un prix barré restait « en
--              rabais » indéfiniment. Julie doit pouvoir borner une promotion
--              dans le temps (soldes, quinzaine, opération ponctuelle).
-- Modèle     : price_chf         = prix payé PENDANT la promo
--              compare_price_chf = prix normal, barré pendant la promo
--              Hors fenêtre, c'est compare_price_chf qui redevient le prix payé.
--              Le calcul se fait à la lecture (voir PROMO_PRICE_SQL dans
--              backend/utils/promo.utils.js) : aucune tâche planifiée, une promo
--              expire d'elle-même à la seconde près.
--              NB : une colonne générée était le premier choix, mais MySQL
--              interdit NOW() dans une expression de colonne générée.
-- Effet      : ajoute promo_starts_at / promo_ends_at (NULL = pas de borne)
--              + un index pour les filtres de promo.
--              Les produits existants gardent promo_starts_at = promo_ends_at =
--              NULL, donc leur rabais actuel reste actif sans limite : le
--              comportement d'aujourd'hui est préservé tant que Julie n'a pas
--              saisi de dates.
-- Idempotent : gardes information_schema sur chaque colonne et sur l'index.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'promo_starts_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE products ADD COLUMN promo_starts_at DATETIME NULL DEFAULT NULL AFTER compare_price_chf',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'promo_ends_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE products ADD COLUMN promo_ends_at DATETIME NULL DEFAULT NULL AFTER promo_starts_at',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index — les filtres « promo en cours » et « promos à échoir » scannent ces dates
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_promo');
SET @sql := IF(@idx = 0,
  'ALTER TABLE products ADD INDEX idx_products_promo (promo_ends_at, promo_starts_at)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
