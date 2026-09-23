-- ============================================================
-- Migration : téléphone du destinataire sur la commande — ticket CLI-08
-- Date       : 2026-09-23
-- Contexte   : demande cliente — « l'adresse complète de livraison » dans
--              l'e-mail de confirmation. Le formulaire de commande demandait un
--              téléphone (facultatif) et l'envoyait au serveur, mais aucune
--              colonne ne le recevait : il était perdu sans erreur. L'étiquette
--              Swiss Post, qui prévoit ce numéro pour prévenir la destinataire,
--              partait donc toujours sans lui.
--
-- Figé sur la commande comme le reste de l'adresse : la cliente peut changer
-- son numéro ensuite, la commande garde celui donné pour CETTE livraison.
-- Donnée personnelle : effacée avec l'adresse à la suppression du compte (LPD),
-- voir user.repository.js.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN shipping_phone VARCHAR(30) NULL DEFAULT NULL AFTER shipping_canton;
