-- ============================================================
-- Migration : adresse fournisseur en champs séparés
-- Date       : 2026-09-15
-- Contexte   : retour cliente — « Fournisseurs : mettre plus de champ, adresse ».
--              L'adresse fournisseur était un unique champ texte libre, alors que
--              les adresses clients sont déjà découpées (rue, numéro, NPA, ville).
--              Champs séparés = étiquettes et courriers exploitables, et cohérence
--              avec le reste de l'application.
-- Effet      : ajoute street, street_number, zip, city, country sur suppliers.
--              L'ancienne colonne `address` est CONSERVÉE : elle contient peut-être
--              déjà des saisies, et la détruire perdrait ces informations. Elle
--              reste affichée en complément tant que la reprise n'est pas faite.
-- Idempotent : gardes information_schema sur chaque colonne.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'street');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN street VARCHAR(255) NULL DEFAULT NULL AFTER address',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'street_number');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN street_number VARCHAR(20) NULL DEFAULT NULL AFTER street',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'zip');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN zip VARCHAR(10) NULL DEFAULT NULL AFTER street_number',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'city');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN city VARCHAR(100) NULL DEFAULT NULL AFTER zip',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Pays : la plupart des éditeurs de kits sont étrangers (Danemark, Russie, France…)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'country');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN country CHAR(2) NULL DEFAULT ''CH'' AFTER city',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Numéro de client chez le fournisseur — utile pour passer commande
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'customer_number');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN customer_number VARCHAR(50) NULL DEFAULT NULL AFTER country',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Site web — souvent le canal de commande réel
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'website');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN website VARCHAR(255) NULL DEFAULT NULL AFTER customer_number',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
