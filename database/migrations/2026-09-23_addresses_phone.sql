-- ============================================================
-- Migration : téléphone sur les adresses du compte client — ticket CLI-06
-- Date       : 2026-09-23
-- Contexte   : demande cliente — « débloquer la modification des coordonnées
--              dans le profil client ». Le compte ne permettait de saisir le
--              téléphone nulle part : la table n'avait pas de colonne pour lui,
--              alors que le checkout tentait déjà de le pré-remplir depuis
--              l'adresse enregistrée (champ toujours vide).
--
-- Facultatif. Donnée personnelle : supprimée avec les adresses à la
-- suppression du compte (LPD) et incluse dans l'export des données.
-- ============================================================

ALTER TABLE addresses
  ADD COLUMN phone VARCHAR(30) NULL DEFAULT NULL AFTER canton;
