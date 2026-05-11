-- Migration 004 — Ajout des colonnes étiquette ShipEngine sur la table orders
-- À exécuter une seule fois sur la base existante (dev, staging, prod)

ALTER TABLE orders
  ADD COLUMN label_url VARCHAR(500) NULL DEFAULT NULL AFTER tracking_number,
  ADD COLUMN label_id  VARCHAR(100) NULL DEFAULT NULL AFTER label_url;
