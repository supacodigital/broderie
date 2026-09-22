-- ============================================================
-- Migration : vente à la coupe (trames et bandes à broder) — ticket ADM-12
-- Date       : 2026-09-16
-- Contexte   : demande cliente — « Prix des trames et bandes à broder : le prix
--              au mètre est correct, mais elles peuvent acheter par 10 cm et le
--              minimum est de 50 cm. »
--              Jusqu'ici tous les produits se vendaient à l'unité : une cliente
--              ne pouvait pas commander 60 cm de bande.
--
-- Modèle retenu :
--   * `price_chf` reste le PRIX AU MÈTRE — il est déjà juste en base, aucune
--     donnée n'est à reprendre.
--   * `sold_by_length` bascule le produit en vente à la coupe.
--   * `cart_items.quantity` / `order_items.quantity` continuent de compter des
--     UNITÉS, mais pour ces produits une unité vaut `length_step_cm` (10 cm).
--     Commander 60 cm = quantité 6. Aucune colonne de longueur à ajouter aux
--     lignes de panier et de commande, et les totaux, la TVA et les stocks
--     continuent de fonctionner sans cas particulier.
--   * `unit_price` stocké dans order_items devient donc le prix du tronçon de
--     10 cm — cohérent avec le sens de `quantity`.
--
-- Le pas et le minimum sont stockés par produit plutôt qu'en constantes : une
-- trame large peut exiger un autre minimum, et la cliente doit pouvoir l'ajuster
-- depuis l'administration sans intervention de développement.
-- ============================================================

-- Gardes information_schema : les colonnes ont pu être créées à la main avant que
-- la migration ne soit enregistrée (constaté en développement le 2026-09-22, où
-- elles existaient déjà alors que schema_migrations l'ignorait). Sans ces gardes,
-- la migration échoue sur « Duplicate column name » et bloque toutes les suivantes.

-- Vente à la coupe : 0 = article vendu à l'unité (comportement par défaut)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sold_by_length');
SET @sql := IF(@col = 0,
  'ALTER TABLE products ADD COLUMN sold_by_length TINYINT(1) NOT NULL DEFAULT 0 AFTER is_made_to_order',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Pas de découpe en centimètres (10 = la cliente commande par tranches de 10 cm)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'length_step_cm');
SET @sql := IF(@col = 0,
  'ALTER TABLE products ADD COLUMN length_step_cm SMALLINT UNSIGNED NOT NULL DEFAULT 10 AFTER sold_by_length',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Longueur minimale commandable, en centimètres
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'length_min_cm');
SET @sql := IF(@col = 0,
  'ALTER TABLE products ADD COLUMN length_min_cm SMALLINT UNSIGNED NOT NULL DEFAULT 50 AFTER length_step_cm',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index partiel impossible en MySQL : on indexe la colonne seule. Elle est très
-- peu sélective (34 produits sur 15 497), mais la boutique doit
-- pouvoir lister les articles vendus à la coupe sans parcourir la table.
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_sold_by_length');
SET @sql := IF(@idx = 0,
  'CREATE INDEX idx_products_sold_by_length ON products (sold_by_length)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Activation sur les trames et bandes à broder existantes.
-- Le ciblage se fait sur le libellé FR : ces articles n'ont ni catégorie ni
-- marque propre qui les isolerait. Vérifié le 2026-09-16 : 34 articles
-- (27 bandes à broder + 7 trames vendues au métrage).
--
-- « canevas » est exclu : dans « Zweigart, canevas Sudan - grosse trame », le
-- mot « trame » décrit le tissage et non un article vendu à la coupe. Sans cette
-- exclusion, un canevas vendu en pièce serait basculé en vente au mètre et son
-- prix deviendrait faux.
--
-- L'administration peut ensuite activer ou désactiver le métrage produit par
-- produit : ce UPDATE n'est qu'une reprise de l'existant, pas une règle figée.
UPDATE products p
JOIN product_translations pt
  ON pt.product_id = p.id AND pt.locale = 'fr'
SET p.sold_by_length = 1,
    p.length_step_cm = 10,
    p.length_min_cm  = 50
WHERE p.is_active = 1
  AND p.deleted_at IS NULL
  AND pt.name NOT LIKE '%canevas%'
  AND (pt.name LIKE '%bande à broder%'
       OR pt.name LIKE '%bande a broder%'
       OR pt.name LIKE '%trame%');
