-- ============================================================
-- Migration : reviews — un seul avis par (utilisateur, produit)
-- Date       : 2026-09-01
-- Contexte   : la route POST /api/v1/products/:id/reviews n'imposait aucune limite —
--              un même compte pouvait empiler N avis sur le même produit (bourrage
--              d'avis 5★ / 1★). Le contrôle d'achat et la validation de longueur sont
--              ajoutés côté code ; cette contrainte garantit l'unicité au niveau BDD.
-- Effet      : UNIQUE (user_id, product_id). Un second INSERT pour le même couple
--              lève ER_DUP_ENTRY, converti en 409 par mapDbError (message
--              "Vous avez déjà laissé un avis pour ce produit.").
-- Sûr car    : dédoublonnage préalable (on garde l'avis le plus récent). L'index
--              non-unique idx_reviews_user devient redondant avec la nouvelle clé
--              (préfixe user_id) et est retiré.
-- Idempotent : chaque étape est gardée par un test information_schema (MySQL 8 n'a
--              pas ADD/DROP ... IF [NOT] EXISTS pour les index).
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

-- 1. Purge des doublons éventuels (conserve l'id le plus élevé = le plus récent)
DELETE r1 FROM reviews r1
INNER JOIN reviews r2
  ON r1.user_id = r2.user_id
 AND r1.product_id = r2.product_id
 AND r1.id < r2.id;

-- 2. Clé unique (user_id, product_id) — ajoutée seulement si absente
SET @has_uq := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'reviews'
    AND INDEX_NAME   = 'uq_reviews_user_product'
);
SET @ddl := IF(@has_uq = 0,
  'ALTER TABLE reviews ADD UNIQUE KEY uq_reviews_user_product (user_id, product_id)',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. Retrait de l'index non-unique redondant idx_reviews_user (préfixe couvert par la clé unique)
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'reviews'
    AND INDEX_NAME   = 'idx_reviews_user'
);
SET @ddl := IF(@has_idx > 0,
  'ALTER TABLE reviews DROP INDEX idx_reviews_user',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
