-- ============================================================
-- Migration : statut « Paiement refusé » — ticket CLI-07
-- Date       : 2026-09-23
-- Contexte   : demande cliente — « lors de la validation d'une commande avec le
--              moyen de paiement Carte, le paiement est refusé mais la commande
--              est quand même créée/présente dans le back-office ». Solution
--              attendue : « la passer en statut Échec de paiement ».
--
-- Une commande carte / Twint est créée avant le paiement (le stock doit être
-- réservé pendant la saisie de la carte). Quand la banque refuse, le webhook
-- Stripe la passe désormais à `payment_failed` : visible en rouge dans
-- l'administration, hors des compteurs « à traiter ». La cliente peut réessayer
-- (la commande passe alors à `paid`) ; sinon elle est annulée au bout de 2 h.
--
-- La valeur est AJOUTÉE EN FIN d'ENUM : MySQL modifie alors seulement les
-- métadonnées, sans reconstruire la table ni toucher aux valeurs existantes.
-- ============================================================

ALTER TABLE orders
  MODIFY status ENUM('pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'payment_failed') NOT NULL DEFAULT 'pending';

ALTER TABLE order_status_history
  MODIFY status ENUM('pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'payment_failed') NOT NULL;
