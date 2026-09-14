-- ============================================================
-- Migration : consent_logs — colonne `accepted` + session_id nullable
-- Date       : 2026-09-01
-- Contexte   : la route POST /api/v1/consent recevait bien { type, accepted, version }
--              du front, mais (1) n'insérait JAMAIS `accepted` (colonne absente) — donc
--              impossible de distinguer un consentement d'un refus, ce qu'exige la LPD ;
--              (2) lisait un cookie `session_id` inexistant (le vrai cookie panier est
--              `cartSession`) → session_id = NULL → violation de NOT NULL → l'INSERT
--              échouait et l'erreur était avalée par un catch muet. Résultat : quasiment
--              aucun consentement anonyme n'était journalisé.
-- Effet      : `accepted` (0 = refusé, 1 = accepté) est désormais stocké ; `session_id`
--              devient nullable (un visiteur peut consentir avant d'avoir un panier).
-- Sûr car    : `accepted` a un DEFAULT 1 pour ne pas casser d'éventuelles lignes déjà
--              présentes (toutes correspondaient de fait à des acceptations) ; passer
--              session_id à NULL est un élargissement de contrainte, jamais bloquant.
-- Idempotent : l'ajout de colonne est gardé par un test information_schema (MySQL 8 n'a
--              pas ADD COLUMN IF NOT EXISTS). Le MODIFY est nativement rejouable.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'consent_logs'
    AND COLUMN_NAME  = 'accepted'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE consent_logs ADD COLUMN accepted TINYINT(1) NOT NULL DEFAULT 1 AFTER type',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE consent_logs
  MODIFY session_id VARCHAR(255) NULL DEFAULT NULL;
