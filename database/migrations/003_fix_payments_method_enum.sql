-- Ajout des méthodes de paiement manquantes : invoice (priorité 1) et postfinance (phase 3)
ALTER TABLE payments
  MODIFY COLUMN method ENUM('card', 'twint', 'invoice', 'postfinance') NOT NULL;
