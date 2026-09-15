-- ============================================================
-- Migration : numérotation des factures + référence QR structurée
-- Date       : 2026-09-15
-- Contexte   : retour cliente — « changer le numéro de référence pour que
--              soit lisible pour la banque » et « changer le numéro de facture,
--              mettre l'année plus un numéro EX 2026-000001 ».
--              La facture modèle qu'elle a transmise porte un numéro séquentiel
--              (93979) et une référence QR structurée à 27 chiffres, lisible
--              automatiquement par sa banque — là où nous produisions une
--              référence interne « APC… » placée dans le message libre.
-- Effet      : 1) orders.invoice_number — numéro affiché (ex. « 2026-000001 »),
--                 figé à l'émission de la facture, jamais recalculé ;
--              2) orders.invoice_seq — compteur brut (1, 2, 3…) de l'année, sert
--                 à construire la référence QR numérique ;
--              3) invoice_counters — un compteur par année civile (période AAAA),
--                 incrémenté de façon atomique : deux commandes simultanées ne
--                 peuvent pas obtenir le même numéro. Le passage à 2027 crée sa
--                 propre ligne et repart à 1, sans intervention.
-- Comptabilité : la séquence est continue et sans trou par année — une facture
--              n'est numérotée qu'au moment où elle est réellement émise.
-- Idempotent : gardes information_schema (colonnes) + CREATE TABLE IF NOT EXISTS.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

-- 1) Compteur annuel -------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_counters (
  period     CHAR(4)         NOT NULL,  -- 'AAAA' (année civile)
  last_seq   INT UNSIGNED    NOT NULL DEFAULT 0,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) orders.invoice_number -------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'invoice_number'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN invoice_number VARCHAR(20) NULL DEFAULT NULL AFTER qr_reference',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) orders.invoice_seq ----------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'invoice_seq'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN invoice_seq INT UNSIGNED NULL DEFAULT NULL AFTER invoice_number',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Unicité du numéro affiché --------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_invoice_number'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE orders ADD UNIQUE KEY uq_orders_invoice_number (invoice_number)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
