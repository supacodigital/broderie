-- ============================================================
-- Migration : délai de livraison porté à 3–5 jours ouvrables
-- Date       : 2026-09-15
-- Contexte   : retour cliente — le délai annoncé « 1 à 2 jours » ne tenait pas
--              compte du temps de préparation de la commande en boutique. Le
--              délai réellement tenu pour les articles EN STOCK est de 3 à 5
--              jours ouvrables (préparation + acheminement Post CH).
--              Les produits « sur commande » ne sont pas concernés : leur délai
--              (3 à 4 semaines) est porté par suppliers.made_to_order_delay_*
--              et affiché séparément sur la fiche produit.
-- Effet      : met à jour estimated_days sur shipping_zones et shipping_rates,
--              et aligne la valeur par défaut de la colonne sur '3-5'.
-- Idempotent : les UPDATE ne ciblent que les anciennes valeurs ('1-2', '2-3').
--              Rejouer la migration ne touche plus aucune ligne. Un délai saisi
--              à la main par l'admin dans Réglages → Livraison est donc préservé.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

-- Valeur par défaut de la colonne, pour toute zone créée par la suite
ALTER TABLE shipping_zones
  ALTER COLUMN estimated_days SET DEFAULT '3-5';

-- Zones existantes — on ne touche qu'aux valeurs livrées d'origine
UPDATE shipping_zones
   SET estimated_days = '3-5'
 WHERE estimated_days IN ('1-2', '2-3');

-- Tarifs existants — idem, les valeurs personnalisées sont conservées
UPDATE shipping_rates
   SET estimated_days = '3-5'
 WHERE estimated_days IN ('1-2', '2-3');
