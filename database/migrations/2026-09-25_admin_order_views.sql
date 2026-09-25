-- ============================================================
-- Migration : commandes consultées par chaque compte admin
-- Date       : 2026-09-25
-- Contexte   : le badge « Commandes » de la barre latérale comptait des
--              statuts (factures en attente de paiement, retraits) au lieu
--              des nouvelles commandes. Il signale désormais les commandes
--              que l'admin connectée n'a encore jamais ouvertes.
-- Effet      : une ligne par (admin, commande) à la première ouverture de la
--              page commande. Suivi PAR COMPTE : une commande ouverte par
--              Kévin reste nouvelle pour Julie.
--              Les commandes existantes sont marquées comme vues par les
--              admins actuels : le badge démarre à 0 au lieu de tout
--              l'historique.
-- Idempotent : CREATE TABLE IF NOT EXISTS et INSERT IGNORE.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_order_views (
  user_id   INT UNSIGNED NOT NULL,
  order_id  INT UNSIGNED NOT NULL,
  viewed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, order_id),
  INDEX idx_admin_order_views_order (order_id),
  CONSTRAINT fk_admin_order_views_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_admin_order_views_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admin_order_views (user_id, order_id)
SELECT u.id, o.id
  FROM users u
  CROSS JOIN orders o
 WHERE u.role IN ('admin', 'super_admin')
   AND o.confirmed_at IS NOT NULL;
