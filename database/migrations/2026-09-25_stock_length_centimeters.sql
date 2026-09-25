-- ============================================================
-- Migration : stock au centimètre des articles vendus au mètre — ticket ADM-12
-- Date       : 2026-09-25
-- Contexte   : demande cliente — « Produits vendus au mètre (trames et bandes) :
--              impossibilité de saisir des décimales dans le champ stock ».
--              Solution attendue : « autoriser la saisie de plusieurs chiffres
--              après la virgule (format type 999 999.99) pour permettre la
--              gestion des stocks en mètres, avec vente par tranches de 10 cm
--              (minimum 50 cm) ».
--
-- `products.stock` reste un entier. Pour un article vendu à la coupe
-- (`sold_by_length = 1`), il compte désormais des CENTIMÈTRES : 2.15 m = 215.
-- La boutique saisit et lit toujours des mètres à deux décimales, seule la
-- base compte en centimètres. Les 14 000 articles à la pièce ne changent pas.
--
-- Avant cette migration le stock de ces articles comptait des mètres entiers,
-- et une commande retirait son nombre de TRONÇONS de 10 cm comme s'il
-- s'agissait de mètres (60 cm vendus = 6 m retirés).
--
-- `order_items.stock_units` : unités de stock réellement retirées par chaque
-- ligne de commande (pièces, ou centimètres pour un article à la coupe, 0 pour
-- un article sur commande). L'annulation rend exactement cette quantité, même
-- si l'article a changé de mode de vente entre-temps. NULL = ligne antérieure.
--
-- IDEMPOTENTE : la base de test rejoue toutes les migrations à chaque
-- exécution. La conversion du stock (× 100) ne doit s'appliquer qu'une fois :
-- elle n'a lieu que si la colonne `stock_units` n'existe pas encore, et la
-- colonne est créée juste après. Aucun point-virgule dans les commentaires
-- ci-dessous : le lanceur de la base de test découpe le fichier sur ce signe.
-- ============================================================

SET @already := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'stock_units');

-- Stock en mètres vers centimètres (une seule fois)
SET @sql := IF(@already = 0,
  'UPDATE products SET stock = stock * 100 WHERE sold_by_length = 1',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@already = 0,
  'ALTER TABLE order_items ADD COLUMN stock_units INT UNSIGNED NULL DEFAULT NULL AFTER quantity',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* Lignes antérieures d'articles à la coupe : elles ont retiré `quantity`
   « mètres » du stock. Une fois le stock en centimètres, leur annulation doit
   en rendre `quantity × 100`. Les articles sur commande n'ont rien retiré. */
SET @sql := IF(@already = 0,
  'UPDATE order_items oi INNER JOIN products p ON p.id = oi.product_id SET oi.stock_units = oi.quantity * 100 WHERE p.sold_by_length = 1 AND p.is_made_to_order = 0',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
