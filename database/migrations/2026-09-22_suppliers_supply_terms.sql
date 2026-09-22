-- ============================================================
-- Migration : délais de réassort et de paiement fournisseur
-- Date       : 2026-09-22
-- Contexte   : le fichier `supply.xlsx` livré par la cliente le 22/09 porte deux
--              colonnes `delais_liv` et `delais_paiement`, exprimées en JOURS
--              (5, 10, 15 ou 30 selon le fournisseur). Ces valeurs viennent de son
--              ancien ERP et servent à savoir quand un réassort arrivera et sous
--              quel délai la facture fournisseur est due — matière directe pour
--              le ticket ADM-09 (suivi des commandes fournisseurs).
-- Effet      : ajoute supply_delay_days et payment_terms_days sur suppliers.
--
-- Pourquoi de NOUVELLES colonnes plutôt que les `made_to_order_delay_*_weeks`
-- existantes : celles-ci sont en SEMAINES et décrivent l'attente annoncée à la
-- CLIENTE pour un produit « sur commande ». Les délais ci-dessous sont en JOURS
-- et concernent la relation avec le FOURNISSEUR. Mélanger les deux afficherait
-- « 30 semaines » en boutique sur un délai de 30 jours.
--
-- Idempotent : gardes information_schema sur chaque colonne.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

-- Délai de livraison du fournisseur, en jours (colonne `delais_liv` de l'ERP)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'supply_delay_days');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN supply_delay_days SMALLINT UNSIGNED NULL DEFAULT NULL AFTER website',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Délai de paiement accordé par le fournisseur, en jours (colonne `delais_paiement`)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'payment_terms_days');
SET @sql := IF(@col = 0,
  'ALTER TABLE suppliers ADD COLUMN payment_terms_days SMALLINT UNSIGNED NULL DEFAULT NULL AFTER supply_delay_days',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
