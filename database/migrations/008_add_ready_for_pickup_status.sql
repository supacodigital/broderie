-- Migration 008 — Statut « Prête pour le retrait » pour le Click & Collect
-- Flux pickup : pending_pickup → ready_for_pickup → paid

-- 1. orders.status
ALTER TABLE orders
  MODIFY COLUMN status ENUM(
    'pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup',
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  ) NOT NULL DEFAULT 'pending';

-- 2. order_status_history.status — même ENUM
ALTER TABLE order_status_history
  MODIFY COLUMN status ENUM(
    'pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup', 'ready_for_pickup',
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  ) NOT NULL;
