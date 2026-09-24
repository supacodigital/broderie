-- ============================================================
-- Migration : rôle super-administrateur — ticket ADM-08
-- Date       : 2026-09-24
-- Contexte   : demande cliente — « Créer un profil super-administrateur avec
--              accès complet aux pages de contenu et blocs promotionnels ».
--
-- `super_admin` a tout ce qu'a `admin`, plus les pages de contenu (CGV,
-- mentions légales, Notre Histoire), le bandeau d'annonce et les blocs de la
-- page d'accueil. Les protections du rôle admin s'appliquent à l'identique
-- (double authentification obligatoire, mot de passe de 12 caractères) —
-- voir middlewares/roles.js.
--
-- Le compte se crée avec backend/scripts/create-super-admin.js : aucun mot de
-- passe n'y transite, son titulaire le choisit via le lien reçu par e-mail.
--
-- Idempotent : l'ENUM est redéfini à l'identique s'il est déjà à jour.
-- ============================================================

ALTER TABLE users
  MODIFY COLUMN role ENUM('client', 'admin', 'super_admin') NOT NULL DEFAULT 'client';
