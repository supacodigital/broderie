-- ============================================================
-- Migration : complément d'adresse (c/o, bâtiment, appartement)
-- Date       : 2026-09-25
-- Contexte   : conformité La Poste — la ligne « complément » (champ
--              AddressSuffix de l'API Barcode, 35 caractères) se place entre
--              le nom et la rue. Faute de champ, les clientes l'écrivaient dans
--              la rue ou le numéro, et l'étiquette les tronquait.
-- Effet      : ajoute addresses.complement, orders.shipping_complement et
--              orders.billing_complement (VARCHAR(35), NULL par défaut).
-- Idempotent : garde information_schema sur chaque colonne.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'complement');
SET @sql := IF(@col = 0,
  'ALTER TABLE addresses ADD COLUMN complement VARCHAR(35) NULL DEFAULT NULL AFTER last_name',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_complement');
SET @sql := IF(@col = 0,
  'ALTER TABLE orders ADD COLUMN shipping_complement VARCHAR(35) NULL DEFAULT NULL AFTER shipping_last_name',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'billing_complement');
SET @sql := IF(@col = 0,
  'ALTER TABLE orders ADD COLUMN billing_complement VARCHAR(35) NULL DEFAULT NULL AFTER billing_last_name',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
