-- ============================================================
-- Migration : corrige le taux de TVA de tous les produits (hôtelier 3.8 % → normal 8.1 %)
-- Date       : 2026-09-01
-- Contexte   : le seed initial (database/broderie.sql) insérait TOUS les produits avec
--              tax_rate_id = 3, or l'ordre d'INSERT dans `tax_rates` donne
--              id 1 = 'Taux normal' (8.1 %, is_default), id 2 = 'Taux réduit' (2.6 %),
--              id 3 = 'Taux hôtelier' (3.8 %). Résultat : fil à broder, kits et toiles
--              étaient facturés à 3.8 % (taux hôtelier) au lieu de 8.1 %.
-- Effet      : chaque produit encore rattaché au taux hôtelier repasse au taux normal.
--              Le code applicatif est déjà correct (le taux vient de `tax_rates` via un
--              LEFT JOIN, puis est figé dans cart_items.tax_rate_snapshot au moment de
--              l'ajout au panier). Cette migration ne touche QUE la donnée de référence.
-- Sûr car    : aucun produit de mercerie / broderie ne relève réellement du taux hôtelier
--              (réservé à l'hébergement). Les commandes déjà passées gardent leur
--              tax_rate_snapshot figé — elles ne sont pas réécrites (c'est voulu :
--              la TVA d'une vente passée ne se recalcule jamais a posteriori).
--              En phase de recette, aucune commande réelle n'existe encore en production.
-- À exécuter : sur staging PUIS production, après backup (déjà automatique sur Infomaniak
--              avant chaque déploiement). Rejouable sans effet une fois appliquée.
-- Vérif      : SELECT p.sku, tr.rate FROM products p
--                JOIN tax_rates tr ON tr.id = p.tax_rate_id LIMIT 5;   -- doit rendre 8.10
--              SELECT COUNT(*) FROM products p
--                JOIN tax_rates tr ON tr.id = p.tax_rate_id
--               WHERE tr.category = 'hotel';                            -- doit rendre 0
-- ============================================================

UPDATE products
SET tax_rate_id = (SELECT id FROM tax_rates WHERE category = 'standard' LIMIT 1)
WHERE tax_rate_id = (SELECT id FROM tax_rates WHERE category = 'hotel' LIMIT 1);
