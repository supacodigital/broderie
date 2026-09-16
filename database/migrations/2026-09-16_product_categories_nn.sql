-- ============================================================
-- Migration : rattachement d'un produit à plusieurs catégories — ticket ADM-04
-- Date       : 2026-09-16
-- Contexte   : demande cliente — un même article doit pouvoir apparaître dans
--              plusieurs rayons de la boutique. Un kit de broderie diamant
--              relève à la fois de « Loisirs & Strass > Broderie Diamant » et
--              de « Broderie > Kits de Broderie » ; jusqu'ici il fallait
--              choisir, et l'article était introuvable dans l'autre rayon.
--
-- Modèle retenu :
--   * `products.category_id` est CONSERVÉ et reste la catégorie PRINCIPALE.
--     C'est elle qui porte le fil d'Ariane, l'URL canonique du produit et les
--     index composites de la boutique (idx_products_active_cat). La supprimer
--     imposerait de réécrire tout le filtrage catalogue et de dégrader des
--     requêtes déjà tenues sur 15 497 produits.
--   * `product_categories` porte les rattachements SUPPLÉMENTAIRES, plus la
--     ligne de la catégorie principale (is_primary = 1) afin qu'une seule
--     requête suffise à lister tous les rayons d'un produit.
--   * L'unicité de la catégorie principale n'est pas exprimable en contrainte
--     MySQL : elle est garantie par le repository, qui réécrit l'ensemble des
--     rattachements d'un produit dans une transaction.
--
-- Réversibilité : aucune donnée n'est détruite. `products.category_id` reste la
-- source de vérité de la catégorie principale ; en cas de retour arrière, il
-- suffit d'ignorer la table de liaison.
-- ============================================================

CREATE TABLE product_categories (
  product_id  INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  -- 1 = catégorie principale (miroir de products.category_id), 0 = rayon secondaire
  is_primary  TINYINT(1)   NOT NULL DEFAULT 0,
  -- Ordre d'affichage des rayons secondaires sur la fiche produit
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, category_id),
  -- Sens boutique : « tous les produits de cette catégorie ». is_primary suit
  -- pour que le tri principal / secondaire ne relise pas la table.
  INDEX idx_prod_cat_category (category_id, is_primary),
  CONSTRAINT fk_prod_cat_product  FOREIGN KEY (product_id)  REFERENCES products (id)   ON DELETE CASCADE,
  CONSTRAINT fk_prod_cat_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reprise de l'existant : chaque produit déjà classé devient un rattachement
-- principal. Les produits soft-deleted sont inclus — leur catégorie doit être
-- restaurée telle quelle si la cliente les réactive.
-- category_id est NULLABLE sur products (catégorie supprimée sous un produit
-- soft-deleted) : ces lignes sont écartées, elles n'ont aucun rayon à reprendre.
INSERT INTO product_categories (product_id, category_id, is_primary, sort_order)
SELECT id, category_id, 1, 0
  FROM products
 WHERE category_id IS NOT NULL;
