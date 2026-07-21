-- ============================================================
-- Migration — Ajout du délai "sur commande" configurable par fournisseur
-- Supaco Digital — 2026
-- À exécuter une seule fois sur les bases existantes (dev/staging/prod)
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN made_to_order_delay_min_weeks TINYINT UNSIGNED NULL DEFAULT NULL AFTER notes,
  ADD COLUMN made_to_order_delay_max_weeks TINYINT UNSIGNED NULL DEFAULT NULL AFTER made_to_order_delay_min_weeks;
