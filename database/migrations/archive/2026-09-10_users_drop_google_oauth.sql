-- ============================================================
-- Migration : suppression de la connexion Google (OAuth)
-- Date       : 2026-09-10
-- Contexte   : la connexion « Continuer avec Google » est retirée du
--              produit (bouton front, route /auth/google/verify,
--              config/google.js, service loginWithGoogle). L'authentification
--              se fait uniquement par email + mot de passe.
-- Effet      : supprime l'index unique uq_users_google puis les colonnes
--              users.google_id et users.avatar_url. Aucune donnée métier
--              perdue — ces colonnes n'étaient renseignées que pour les
--              comptes créés via Google (aucun sur ce déploiement).
--              Un compte qui n'aurait qu'un google_id sans mot de passe
--              devra passer par « mot de passe oublié » pour s'en créer un.
-- Idempotent : gardes information_schema + PREPARE/EXECUTE.
-- À exécuter : sur staging PUIS production, après backup.
-- Répercuté dans broderie.sql : oui (colonnes + index retirés de CREATE TABLE users).
-- ============================================================

-- ── index unique uq_users_google ───────────────────────────
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_google'
);
SET @ddl := IF(@has_idx > 0, 'ALTER TABLE users DROP INDEX uq_users_google', 'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── users.google_id ────────────────────────────────────────
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_id'
);
SET @ddl := IF(@has_col > 0, 'ALTER TABLE users DROP COLUMN google_id', 'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── users.avatar_url ───────────────────────────────────────
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'
);
SET @ddl := IF(@has_col > 0, 'ALTER TABLE users DROP COLUMN avatar_url', 'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
