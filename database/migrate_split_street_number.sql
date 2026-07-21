-- ============================================================
-- Migration — Séparation rue / numéro dans les adresses
-- Supaco Digital — 2026
-- À exécuter une seule fois sur les bases existantes (dev/staging/prod)
-- ============================================================

ALTER TABLE addresses
  ADD COLUMN street_number VARCHAR(20) NULL DEFAULT NULL AFTER street;

ALTER TABLE orders
  ADD COLUMN shipping_street_number VARCHAR(20) NULL DEFAULT NULL AFTER shipping_street,
  ADD COLUMN billing_street_number  VARCHAR(20) NULL DEFAULT NULL AFTER billing_street;
