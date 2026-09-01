-- ============================================================
-- Migration : users.token_version — invalidation des sessions
-- Date       : 2026-09-02
-- Contexte   : le refresh token est un JWT stateless de 7 jours, sans table de
--              sessions ni compteur en base. Après un « mot de passe oublié » ou
--              un changement de mot de passe, seul le hash changeait : tous les
--              refresh tokens émis avant restaient valides 7 jours. Un attaquant
--              ayant volé un token conservait donc l'accès malgré le reset.
-- Effet      : chaque refresh token porte le token_version du compte au moment
--              de son émission. resetPassword / changePassword incrémentent la
--              colonne ; authService.refreshToken rejette tout token dont le
--              token_version ne correspond plus.
-- Sûr car    : colonne NOT NULL DEFAULT 0 — tous les comptes existants démarrent
--              à 0, les refresh tokens en cours (émis sans claim tv) sont tolérés
--              une fois via un fallback (tv absent == 0), puis réémis avec le claim.
-- Idempotent : garde information_schema (MySQL 8 n'a pas ADD COLUMN IF NOT EXISTS).
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'token_version'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_active',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
