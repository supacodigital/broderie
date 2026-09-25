-- ============================================================
-- Migration : stockage du PDF de l'étiquette La Poste
-- Date       : 2026-09-25
-- Contexte   : l'étiquette renvoyée par La Poste (PDF en base64, plusieurs
--              dizaines de Ko) était enregistrée dans orders.label_url,
--              limitée à 500 caractères. En mode strict, MySQL refusait
--              l'enregistrement : étiquette créée chez La Poste mais perdue.
-- Effet      : ajoute orders.label_pdf (MEDIUMBLOB, NULL par défaut).
--              label_url garde le lien de suivi post.ch.
-- Idempotent : garde information_schema sur la colonne.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'label_pdf');
SET @sql := IF(@col = 0,
  'ALTER TABLE orders ADD COLUMN label_pdf MEDIUMBLOB NULL DEFAULT NULL AFTER label_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
