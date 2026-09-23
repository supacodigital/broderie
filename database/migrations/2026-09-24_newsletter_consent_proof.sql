-- ============================================================
-- Migration : preuve du consentement newsletter — ticket CLI-05
-- Date       : 2026-09-24
-- Contexte   : demande cliente — « e-mail de confirmation d'opt-in newsletter
--              non conforme (nLPD/RGPD) ». Le formulaire de l'accueil abonnait
--              immédiatement, sans e-mail de confirmation, et rien ne permettait
--              de prouver quand ni comment le consentement avait été donné.
--
--   * source       : où la demande a été faite — case cochée à la création du
--                    compte, ou formulaire newsletter du site.
--   * confirmed_at : date du clic sur le lien de confirmation (double opt-in).
--                    NULL = demande jamais confirmée : l'adresse ne reçoit rien.
--
-- `subscribed_at` reste la date de la DEMANDE. Aucune abonnée existante au
-- 24/09/2026 (confirmé par Kévin) : pas de reprise de données.
-- ============================================================

ALTER TABLE newsletter_subscribers
  ADD COLUMN source ENUM('account', 'form') NOT NULL DEFAULT 'form' AFTER locale,
  ADD COLUMN confirmed_at DATETIME NULL DEFAULT NULL AFTER subscribed_at;
