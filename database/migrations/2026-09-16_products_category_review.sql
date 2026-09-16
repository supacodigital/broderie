-- ============================================================
-- Migration : drapeau « catégorie à affiner » — ticket ADM-04
-- Date       : 2026-09-16
-- Contexte   : dans le fichier catalogue renvoyé par la cliente le 2026-09-16,
--              la colonne « À revoir » vaut « Catégorie à affiner » sur 14 670
--              des 15 497 lignes, contre « Complet » sur 827 seulement. Autrement
--              dit, la cliente n'a validé le classement que sur 5 % du catalogue :
--              le reste est le rangement automatique proposé à l'import initial.
--
-- Sans cette colonne, l'information se perdrait au réimport et la cliente
-- n'aurait aucun moyen de retrouver, depuis l'administration, les articles
-- qu'elle voulait encore reclasser.
--
-- 1 = classement à revoir (valeur par défaut tant que rien n'a été confirmé),
-- 0 = classement validé par la cliente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN category_needs_review TINYINT(1) NOT NULL DEFAULT 1 AFTER category_id;

-- Peu sélectif aujourd'hui (94 % des lignes à 1), mais l'administration doit
-- pouvoir filtrer « à reclasser » sans parcourir les 15 497 produits, et le
-- rapport s'inversera à mesure que la cliente validera ses rayons.
CREATE INDEX idx_products_category_review ON products (category_needs_review);
