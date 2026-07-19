-- Migration 011 — Authentification à deux facteurs (MFA / TOTP) pour admin et super_admin
-- À exécuter une seule fois sur la base existante (dev, staging, prod)
--
-- Contexte : la MFA (TOTP, type Google Authenticator) devient obligatoire pour les
-- comptes admin et super_admin. Les comptes client ne sont pas concernés. Le secret
-- TOTP est chiffré (AES-256-GCM, jamais en clair) car il doit rester déchiffrable
-- pour recalculer le code attendu — contrairement à un mot de passe, il ne peut pas
-- être simplement haché. Les codes de récupération, eux, sont hachés (bcrypt) comme
-- des mots de passe puisqu'ils n'ont besoin que d'être comparés, jamais déchiffrés.
--
-- Tables créées :
--   - user_mfa : un secret TOTP chiffré par utilisateur, statut d'activation,
--     compteur d'échecs et verrou temporaire anti-brute-force
--   - user_mfa_recovery_codes : codes de récupération à usage unique (une ligne par code)
--
-- Aucune donnée existante n'est modifiée. Les admins déjà en base n'ont simplement pas
-- encore de ligne dans user_mfa, ce qui déclenchera le flux de setup obligatoire au
-- prochain login (voir auth.service.js).

CREATE TABLE user_mfa (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  secret_encrypted    VARBINARY(255) NOT NULL,
  secret_iv           VARBINARY(16)  NOT NULL,
  secret_auth_tag     VARBINARY(16)  NOT NULL,
  enabled_at          DATETIME NULL DEFAULT NULL,
  last_used_at        DATETIME NULL DEFAULT NULL,
  failed_attempts     INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME NULL DEFAULT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_mfa_user (user_id),
  CONSTRAINT fk_user_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_mfa_recovery_codes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  used_at     DATETIME NULL DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_recovery_user_unused (user_id, used_at),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
