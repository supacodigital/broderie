-- Migration 005 — Connexion Google OAuth
-- password_hash devient nullable (comptes Google sans mot de passe)
-- Ajout google_id et avatar_url sur la table users

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL,
  ADD    COLUMN google_id     VARCHAR(255) NULL DEFAULT NULL AFTER locale,
  ADD    COLUMN avatar_url    VARCHAR(500) NULL DEFAULT NULL AFTER google_id,
  ADD    UNIQUE KEY uq_users_google (google_id);
