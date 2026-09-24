-- ============================================================
-- Migration : commande « confirmée » — ticket CLI-07
-- Date       : 2026-09-25
-- Contexte   : demande cliente — « lors de la validation d'une commande avec le
--              moyen de paiement Carte, le paiement est refusé mais la commande
--              est quand même créée/présente dans le back-office ». Solution
--              attendue : « empêcher la validation de la commande en back-office
--              si le paiement par carte est refusé/échoue ».
--
-- Une commande carte / Twint est créée AVANT le paiement (le stock doit être
-- réservé pendant la saisie de la carte). Tant qu'elle n'est pas payée, ce n'est
-- qu'une tentative : elle ne doit apparaître ni dans la liste des commandes de
-- la boutique, ni dans « Mes commandes », ni consommer de numéro de facture.
--
-- `confirmed_at` marque le moment où la commande devient réelle :
--   - facture / retrait en boutique : dès sa création ;
--   - carte / Twint : au paiement accepté.
-- NULL = tentative de paiement en ligne non aboutie (en attente, refusée, ou
-- annulée sans paiement), consultable dans la vue « Paiements non aboutis ».
-- ============================================================

ALTER TABLE orders
  ADD COLUMN confirmed_at DATETIME NULL DEFAULT NULL AFTER status,
  ADD INDEX idx_orders_confirmed (confirmed_at, created_at);

/* Reprise des commandes existantes.
   Le moyen de paiement d'une commande est porté par sa PREMIÈRE ligne `payments`
   (celle enregistrée à sa création).
   - Autre que carte / Twint : confirmée à sa création.
   - Carte / Twint : confirmée à son premier passage à « payée ». Une commande
     que la boutique a fait avancer à la main (préparée, expédiée…) sans
     paiement enregistré est aussi une vraie commande : confirmée à sa dernière
     mise à jour. Restent NULL les seules tentatives jamais payées : en attente,
     refusées, ou annulées sans paiement. */
UPDATE orders o
LEFT JOIN (
  SELECT p.order_id, p.method
  FROM payments p
  JOIN (SELECT order_id, MIN(id) AS first_id FROM payments GROUP BY order_id) f ON f.first_id = p.id
) fm ON fm.order_id = o.id
LEFT JOIN (
  SELECT order_id, MIN(created_at) AS paid_at
  FROM order_status_history
  WHERE status = 'paid'
  GROUP BY order_id
) h ON h.order_id = o.id
SET o.confirmed_at = CASE
  WHEN fm.method IS NULL OR fm.method NOT IN ('card', 'twint') THEN o.created_at
  WHEN h.paid_at IS NOT NULL THEN h.paid_at
  WHEN o.status NOT IN ('pending', 'awaiting_payment', 'payment_failed', 'cancelled') THEN o.updated_at
  ELSE NULL
END,
    -- Reprise technique : ne pas faire passer toutes les commandes pour « modifiées aujourd'hui »
    o.updated_at = o.updated_at
WHERE o.confirmed_at IS NULL;
