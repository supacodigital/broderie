-- Migration 001 — Ajout colonne badge sur products
ALTER TABLE products
  ADD COLUMN badge ENUM('nouveaute','promo','coup_de_coeur','exclusif') NULL DEFAULT NULL
  AFTER is_featured;
