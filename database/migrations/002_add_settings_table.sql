-- Table de paramètres clé/valeur pour les réglages boutique
CREATE TABLE IF NOT EXISTS settings (
  `key`        VARCHAR(100) NOT NULL PRIMARY KEY,
  `value`      TEXT         NULL,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Valeurs par défaut — informations boutique
INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('store_name',    'Broderie & Cie'),
  ('store_email',   ''),
  ('store_phone',   ''),
  ('store_address', ''),
  ('cgv',           ''),
  ('mentions_legales', ''),
  ('politique_retour', '');
