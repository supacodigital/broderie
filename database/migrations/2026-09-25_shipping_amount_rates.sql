-- ============================================================
-- Migration : frais de port selon le montant du panier — ticket ADM-10
-- Date       : 2026-09-25
-- Contexte   : demande cliente — « le modèle par tranches de poids est
--              inadapté. Impossible de renseigner le poids de plus de 15 000
--              références ». Solution attendue : « définir une alternative au
--              calcul par poids (forfait, montant du panier, etc.) ».
--
-- Choix : grille par montant des articles (TTC, avant code promo), éditable
-- dans Paramètres - Livraison. Chaque tranche a un plafond, la dernière n'en a
-- pas (NULL = au-delà). Une seule tranche = forfait. Frais toujours payants :
-- aucun tarif à 0 (contrainte CHECK).
--
-- L'ancienne table shipping_rates (par poids) n'est plus lue mais reste en
-- place pour un éventuel retour arrière.
--
-- Grille de départ, posée une seule fois (table vide) : un forfait au tarif
-- de la première tranche de poids actuelle, ce que paient aujourd'hui les
-- paniers sans poids renseigné. La boutique règle ensuite ses tranches.
--
-- Idempotente : la base de test rejoue toutes les migrations. Aucun
-- point-virgule dans les commentaires.
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_amount_rates (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  max_amount_chf DECIMAL(10, 2) NULL DEFAULT NULL,
  price_chf      DECIMAL(10, 2) NOT NULL,
  estimated_days VARCHAR(20)    NULL DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_shipping_amount_price CHECK (price_chf > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO shipping_amount_rates (max_amount_chf, price_chf, estimated_days)
SELECT NULL, sr.price_chf, sr.estimated_days
FROM shipping_rates sr
WHERE NOT EXISTS (SELECT 1 FROM shipping_amount_rates)
ORDER BY sr.max_weight ASC
LIMIT 1;
