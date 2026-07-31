-- ============================================================
-- Migration : products.featured_order
-- Date       : 2026-07-31
-- Contexte   : l'ordre des 5 produits vedettes affichés en grille bento sur
--              la home n'était jamais persisté — l'admin triait par
--              created_at ASC, la home par updated_at DESC, ce qui donnait
--              deux ordres différents (voir capture utilisateur : "grande
--              carte" différente entre l'admin et le site).
-- Effet      : nouvelle colonne featured_order, remplie via un nouvel
--              endpoint admin (PUT /admin/products/featured-order, drag &
--              drop dans la bande "Vitrine home — bento grid"). Les deux
--              repositories (product.repository.js pour la home,
--              product.admin.repository.js pour l'admin) trient désormais
--              sur la même colonne dès que le filtre "featured" est actif.
-- Sûr car    : colonne nullable, valeur NULL par défaut pour tous les
--              produits existants (fallback automatique sur created_at ASC
--              tant que l'admin n'a pas glissé-déposé les cartes).
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

ALTER TABLE products
  ADD COLUMN featured_order INT UNSIGNED NULL DEFAULT NULL AFTER is_featured;
