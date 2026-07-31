-- ============================================================
-- Migration : category_id nullable + ON DELETE SET NULL
-- Date       : 2026-07-31
-- Contexte   : la suppression d'une catégorie échouait (erreur MySQL
--              ER_ROW_IS_REFERENCED_2) dès qu'un produit soft-supprimé
--              (deleted_at renseigné) y était encore rattaché, alors que
--              le code applicatif ignore volontairement ces produits dans
--              son propre check. La contrainte FK, elle, ne connaît rien
--              du soft-delete et bloquait quand même le DELETE.
-- Effet      : products.category_id devient NULL automatiquement quand
--              sa catégorie est supprimée (comme fk_categories_parent le
--              fait déjà pour les catégories enfants).
-- Sûr car    : seuls des produits déjà soft-supprimés peuvent finir avec
--              category_id = NULL (un produit actif bloque toujours la
--              suppression via le check applicatif en amont). La boutique
--              et l'admin filtrent déjà deleted_at IS NULL partout, donc
--              aucun impact sur le catalogue visible.
-- À exécuter : sur staging PUIS production, après backup (déjà en place
--              automatiquement sur Infomaniak avant chaque déploiement).
-- ============================================================

ALTER TABLE products
  MODIFY category_id INT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE products
  DROP FOREIGN KEY fk_products_category;

ALTER TABLE products
  ADD CONSTRAINT fk_products_category
  FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL;
