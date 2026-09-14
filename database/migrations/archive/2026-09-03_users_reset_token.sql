-- ============================================================
-- Migration : users.reset_token_hash + users.reset_token_expires
-- Date       : 2026-09-03
-- Contexte   : le flux « mot de passe oublié / réinitialisation »
--              (auth.service.js resetPassword / forgotPassword,
--              user.repository.js setResetToken / findByResetToken /
--              resetPasswordByToken) écrit et lit ces deux colonnes
--              depuis toujours, mais elles n'ont jamais figuré dans le
--              schéma versionné (ni schema.sql, ni broderie.sql). Les
--              bases de dev historiques les avaient — une base montée
--              de zéro depuis broderie.sql ne les a pas, d'où un
--              « Unknown column 'reset_token_hash' » (HTTP 500) sur
--              /auth/forgot-password, /auth/reset-password et
--              DELETE /users/me (qui purge aussi ces champs).
-- Effet      : deux colonnes nullables sur users, sur le modèle exact
--              de verify_token_hash / verify_token_expires (jeton SHA-256
--              hex = 64 caractères, échéance DATETIME). Aucune donnée
--              existante impactée (NULL par défaut).
-- Idempotent : gardes information_schema + PREPARE/EXECUTE
--              (MySQL 8 n'a pas ADD COLUMN IF NOT EXISTS).
-- À exécuter : sur staging PUIS production, après backup.
-- Répercuté dans broderie.sql : oui (colonnes ajoutées à CREATE TABLE users).
-- ============================================================

-- ── users.reset_token_hash ─────────────────────────────────
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token_hash'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(64) NULL DEFAULT NULL AFTER verify_token_expires',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── users.reset_token_expires ──────────────────────────────
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token_expires'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE users ADD COLUMN reset_token_expires DATETIME NULL DEFAULT NULL AFTER reset_token_hash',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
