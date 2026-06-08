-- Migration 006 — Ajout colonne is_made_to_order sur products
-- Produits « sur commande » : commande possible même sans stock (délai fixe 3 à 4 semaines)
ALTER TABLE products
  ADD COLUMN is_made_to_order TINYINT(1) NOT NULL DEFAULT 0
  AFTER is_featured;
