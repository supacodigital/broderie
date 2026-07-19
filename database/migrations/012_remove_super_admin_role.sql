-- Migration 012 — Suppression du rôle super_admin
-- À exécuter une seule fois sur la base existante (dev, staging, prod)
--
-- Contexte : back-office simplifié à un seul rôle admin (Julie). Toute intervention
-- nécessitant un accès élevé (modification directe de données, cas de support) est
-- désormais faite manuellement en base par Supaco Digital, hors de l'application.
--
-- 1. Les comptes super_admin existants deviennent admin (aucune perte de droits :
--    admin a désormais accès à tout le back-office).
UPDATE users SET role = 'admin' WHERE role = 'super_admin';

-- 2. Retire 'super_admin' de l'ENUM — plus aucune ligne ne peut l'utiliser après l'UPDATE ci-dessus.
ALTER TABLE users
  MODIFY COLUMN role ENUM('client', 'admin') NOT NULL DEFAULT 'client';
