-- ============================================================
-- Migration : historique des prix — période de promotion et prix de départ (ADM-21)
-- Date       : 2026-09-24
-- Contexte   : la cliente juge l'historique « manquant ». Deux raisons :
--
--   1. Il ne commençait qu'au premier changement APRÈS sa mise en place (22.09) :
--      tout le catalogue ayant été importé avant, chaque fiche affichait
--      « Aucun changement de prix enregistré ». Chaque produit reçoit ici une
--      ligne « prix initial », datée de sa création dans la boutique : le prix
--      d'avant le premier changement enregistré, ou le prix actuel s'il n'a
--      jamais changé.
--
--   2. La période de promotion n'était pas conservée. C'est pourtant elle que
--      l'ordonnance sur l'indication des prix (OIP) contrôle : un prix barré ne
--      peut être affiché que pendant une durée limitée, et doit avoir été
--      réellement pratiqué avant. Chaque ligne porte désormais la période en
--      vigueur APRÈS le changement ; celle d'avant est portée par la ligne
--      précédente du même produit.
--
-- Idempotent : colonnes ajoutées sous garde information_schema, ENUM redéfini à
-- l'identique, lignes initiales insérées une seule fois par produit.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

-- Début de la promotion en vigueur après le changement — NULL : pas de borne
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price_history' AND COLUMN_NAME = 'promo_starts_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE product_price_history ADD COLUMN promo_starts_at DATETIME NULL DEFAULT NULL AFTER new_compare_price_chf',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Fin de la promotion en vigueur après le changement — NULL : sans fin prévue
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price_history' AND COLUMN_NAME = 'promo_ends_at');
SET @sql := IF(@col = 0,
  'ALTER TABLE product_price_history ADD COLUMN promo_ends_at DATETIME NULL DEFAULT NULL AFTER promo_starts_at',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- « initial » : prix relevé à la mise en place de l'historique complet
ALTER TABLE product_price_history
  MODIFY COLUMN source ENUM('admin', 'import', 'script', 'initial') NOT NULL DEFAULT 'admin';

-- Prix de départ de chaque produit, daté de sa création dans la boutique.
-- Produit déjà modifié depuis le 22.09 : son prix d'AVANT le premier changement
-- enregistré (la période de promotion de l'époque n'était pas conservée).
-- Un produit dont la première ligne est déjà une création (ancien prix NULL)
-- a son prix de départ : il n'en reçoit pas d'autre.
INSERT INTO product_price_history
  (product_id, old_price_chf, old_compare_price_chf, new_price_chf, new_compare_price_chf,
   promo_starts_at, promo_ends_at, source, changed_by, changed_at)
SELECT p.id, NULL, NULL,
       IF(f.id IS NULL, p.price_chf, f.old_price_chf),
       IF(f.id IS NULL, p.compare_price_chf, f.old_compare_price_chf),
       IF(f.id IS NULL AND p.compare_price_chf IS NOT NULL, p.promo_starts_at, NULL),
       IF(f.id IS NULL AND p.compare_price_chf IS NOT NULL, p.promo_ends_at, NULL),
       'initial', NULL, p.created_at
FROM products p
LEFT JOIN product_price_history f
  ON f.id = (SELECT MIN(h.id) FROM product_price_history h WHERE h.product_id = p.id)
WHERE p.deleted_at IS NULL
  AND (f.id IS NULL OR f.old_price_chf IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM product_price_history i
                  WHERE i.product_id = p.id AND i.source = 'initial');
