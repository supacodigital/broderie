-- Migration 009 — Adresse de facturation distincte + noms figés sur la commande
-- À exécuter une seule fois sur la base existante (dev, staging, prod)
--
-- Contexte :
--   1) La commande ne figeait que l'adresse de LIVRAISON (shipping_*) et perdait
--      le prénom/nom saisis au checkout (relus depuis users à l'affichage).
--   2) La cliente souhaite une adresse de FACTURATION pouvant différer de la livraison.
--
-- Cette migration ajoute :
--   - les noms figés du destinataire de livraison (shipping_first_name/last_name)
--   - l'adresse de facturation complète figée (billing_*), noms inclus
--   - un type sur les adresses enregistrées du compte (shipping | billing | both)

-- ── Table orders : noms de livraison figés + adresse de facturation figée ──
ALTER TABLE orders
  ADD COLUMN shipping_first_name VARCHAR(100)  NULL DEFAULT NULL AFTER qr_reference,
  ADD COLUMN shipping_last_name  VARCHAR(100)  NULL DEFAULT NULL AFTER shipping_first_name,
  ADD COLUMN billing_first_name  VARCHAR(100)  NULL DEFAULT NULL AFTER shipping_canton,
  ADD COLUMN billing_last_name   VARCHAR(100)  NULL DEFAULT NULL AFTER billing_first_name,
  ADD COLUMN billing_street      VARCHAR(255)  NULL DEFAULT NULL AFTER billing_last_name,
  ADD COLUMN billing_city        VARCHAR(100)  NULL DEFAULT NULL AFTER billing_street,
  ADD COLUMN billing_zip         VARCHAR(10)   NULL DEFAULT NULL AFTER billing_city,
  ADD COLUMN billing_country     CHAR(2)       NULL DEFAULT 'CH' AFTER billing_zip,
  ADD COLUMN billing_canton      CHAR(2)       NULL DEFAULT NULL AFTER billing_country;

-- ── Table addresses : type d'adresse + nom propre (facturation à un tiers) ──
ALTER TABLE addresses
  ADD COLUMN address_type ENUM('shipping', 'billing', 'both') NOT NULL DEFAULT 'both' AFTER label,
  ADD COLUMN first_name   VARCHAR(100) NULL DEFAULT NULL AFTER address_type,
  ADD COLUMN last_name    VARCHAR(100) NULL DEFAULT NULL AFTER first_name;
