-- ============================================================
-- Migration : table stripe_webhook_events — idempotence des webhooks
-- Date       : 2026-09-02
-- Contexte   : Stripe retente un webhook non acquitté (jusqu'à 3 jours). Le
--              handler n'enregistrait pas event.id : un payment_intent.succeeded
--              reçu deux fois insérait un doublon dans order_status_history et,
--              surtout, créditait deux fois les points de fidélité
--              (loyaltyService.processOrderEarning ajoutait une transaction `earn`
--              à chaque passage — le garde tierAlreadyRewarded ne couvre que les
--              paliers, pas le total_spend_chf cumulé).
-- Effet      : chaque event Stripe est enregistré une fois (PK sur event_id).
--              handleWebhook sort immédiatement si l'event est déjà traité.
-- Idempotent : CREATE TABLE IF NOT EXISTS.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id     VARCHAR(255) NOT NULL,
  type         VARCHAR(100) NOT NULL,
  processed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
