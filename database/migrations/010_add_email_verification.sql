-- Migration 010 — Vérification de l'adresse email (double opt-in, non bloquant)
-- À exécuter une seule fois sur la base existante (dev, staging, prod)
--
-- Contexte : à l'inscription, un email de confirmation est envoyé. Le compte reste
-- utilisable (approche non bloquante) mais un bandeau invite à confirmer tant que
-- l'email n'est pas vérifié. Les inscriptions Google sont auto-vérifiées.
--
-- Colonnes ajoutées sur users :
--   - email_verified_at : date de confirmation (NULL = non vérifié)
--   - verify_token_hash : hachage SHA-256 du token de vérification (jamais le token brut)
--   - verify_token_expires : expiration du token

ALTER TABLE users
  ADD COLUMN email_verified_at    DATETIME    NULL DEFAULT NULL AFTER is_active,
  ADD COLUMN verify_token_hash    VARCHAR(64) NULL DEFAULT NULL AFTER email_verified_at,
  ADD COLUMN verify_token_expires DATETIME    NULL DEFAULT NULL AFTER verify_token_hash;

-- Les comptes déjà existants (dont les 1800 migrés) sont considérés comme vérifiés :
-- on ne veut pas leur imposer une confirmation rétroactive.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
