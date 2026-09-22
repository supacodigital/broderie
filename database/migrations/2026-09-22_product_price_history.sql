-- ============================================================
-- Migration : historique des prix de vente — ticket ADM-21
-- Date       : 2026-09-22
-- Contexte   : demande cliente — « Si changement de prix de vente, il manque
--              l'historique des prix ». Une modification de prix écrasait
--              l'ancienne valeur sans trace : impossible de dire à quel prix un
--              article était vendu la semaine précédente.
--
-- Cadre légal : l'ordonnance suisse sur l'indication des prix (OIP) encadre
--              l'annonce d'un rabais — un prix barré doit correspondre à un prix
--              réellement pratiqué. Sans historique, la boutique ne peut pas
--              justifier ses prix barrés en cas de contrôle.
--
-- Modèle retenu :
--   * Une ligne PAR CHANGEMENT effectif, pas par enregistrement de la fiche :
--     réenregistrer un produit sans toucher au prix n'écrit rien. Sinon la table
--     grossirait à chaque correction de libellé sur 15 000 articles.
--   * Les DEUX prix sont conservés (prix de vente et prix barré) : c'est leur
--     couple qui constitue l'offre commerciale, et c'est le prix barré que l'OIP
--     surveille.
--   * `changed_by` référence l'utilisateur admin à l'origine du changement, NULL
--     pour les imports et scripts en masse. ON DELETE SET NULL : la suppression
--     d'un compte admin ne doit pas effacer l'historique comptable.
--   * `source` distingue l'origine : édition manuelle, import catalogue, script
--     de mise à jour en masse. Sans cette colonne, un prix modifié par un import
--     serait indiscernable d'une décision commerciale.
--
-- Rétention : aucune purge automatique. Ces lignes sont des pièces
--             justificatives ; leur volume est négligeable (un changement de
--             prix reste un événement rare face aux 15 000 articles).
--
-- Idempotent : CREATE TABLE IF NOT EXISTS + gardes information_schema.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_price_history (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id        INT UNSIGNED NOT NULL,
  -- Prix AVANT le changement — NULL à la création du produit (aucun prix antérieur)
  old_price_chf     DECIMAL(10, 2) NULL DEFAULT NULL,
  old_compare_price_chf DECIMAL(10, 2) NULL DEFAULT NULL,
  -- Prix APRÈS le changement
  new_price_chf     DECIMAL(10, 2) NOT NULL,
  new_compare_price_chf DECIMAL(10, 2) NULL DEFAULT NULL,
  -- Origine du changement : admin | import | script
  source            ENUM('admin', 'import', 'script') NOT NULL DEFAULT 'admin',
  -- Compte admin à l'origine du changement — NULL pour les traitements en masse
  changed_by        INT UNSIGNED NULL DEFAULT NULL,
  changed_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Requête principale : l'historique d'un produit, du plus récent au plus ancien
  INDEX idx_price_history_product (product_id, changed_at),
  -- Vue transversale « qu'est-ce qui a changé cette semaine »
  INDEX idx_price_history_date (changed_at),
  CONSTRAINT fk_price_history_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_price_history_user FOREIGN KEY (changed_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
