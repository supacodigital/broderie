-- ============================================================
-- Migration — Ajout des dimensions produit (longueur / largeur)
-- Supaco Digital — 2026
-- À exécuter une seule fois sur les bases existantes (dev/staging/prod)
-- ============================================================

ALTER TABLE products
  ADD COLUMN length_cm DECIMAL(8, 2) NULL DEFAULT NULL AFTER badge,
  ADD COLUMN width_cm  DECIMAL(8, 2) NULL DEFAULT NULL AFTER length_cm;
