-- Migration 007 — 4 méthodes de paiement + statuts dédiés facture/retrait
-- Méthodes : carte, Twint (sans QR), facture QR suisse à 30 jours, click & collect (paiement en boutique)

-- 1. payments.method : remplace 'invoice'/'postfinance' par 'invoice_qr' et 'pickup'
-- 1a. Conversion préalable des anciennes valeurs (étape obligatoire avant de réduire l'ENUM)
--     'invoice' devient 'invoice_qr' (la facture QR remplace l'ancienne notion de facture)
UPDATE payments SET method = 'card' WHERE method = 'postfinance';
-- 'invoice' n'est pas encore dans le nouvel ENUM : on élargit d'abord temporairement
ALTER TABLE payments
  MODIFY COLUMN method ENUM('card', 'twint', 'invoice', 'postfinance', 'invoice_qr', 'pickup') NOT NULL;
UPDATE payments SET method = 'invoice_qr' WHERE method = 'invoice';
-- 1b. ENUM final, une fois toutes les lignes converties
ALTER TABLE payments
  MODIFY COLUMN method ENUM('card', 'twint', 'invoice_qr', 'pickup') NOT NULL;

-- 2. orders.status : ajoute 'pending_invoice' (facture envoyée, attente paiement)
--    et 'pending_pickup' (attente retrait + paiement en boutique)
ALTER TABLE orders
  MODIFY COLUMN status ENUM(
    'pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup',
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  ) NOT NULL DEFAULT 'pending';

-- 3. order_status_history.status : même ENUM pour garder l'historique cohérent
ALTER TABLE order_status_history
  MODIFY COLUMN status ENUM(
    'pending', 'awaiting_payment', 'pending_invoice', 'pending_pickup',
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  ) NOT NULL;

-- 4. orders.qr_reference : référence de paiement QR figée (facture QR suisse)
--    Permet de régénérer le PDF et de rapprocher le paiement reçu
ALTER TABLE orders
  ADD COLUMN qr_reference VARCHAR(27) NULL DEFAULT NULL AFTER total;
