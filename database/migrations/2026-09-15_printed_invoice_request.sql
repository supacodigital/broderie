-- ============================================================
-- Migration : demande de facture imprimée jointe au colis
-- Date       : 2026-09-15
-- Contexte   : demande cliente — certaines clientes souhaitent une facture
--              papier dans le colis (classement comptable, cadeau, pas
--              d'imprimante à domicile). La facture PDF continue d'être
--              envoyée par email dans TOUS les cas : le papier vient en plus,
--              il ne remplace pas l'envoi numérique.
-- Effet      : ajoute orders.wants_printed_invoice (0/1, défaut 0).
--              Les commandes existantes passent donc à 0 — aucune demande
--              rétroactive, ce qui est le comportement voulu.
-- Idempotent : garde information_schema sur la colonne.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'wants_printed_invoice');
SET @sql := IF(@col = 0,
  'ALTER TABLE orders ADD COLUMN wants_printed_invoice TINYINT(1) NOT NULL DEFAULT 0 AFTER label_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
