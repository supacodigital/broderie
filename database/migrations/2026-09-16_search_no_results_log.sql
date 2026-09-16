-- ============================================================
-- Migration : journal des recherches sans résultat
-- Date       : 2026-09-16
-- Contexte   : la boutique ne disait pas ce que les clientes cherchent en vain.
--              Sans cette donnée, impossible de savoir s'il manque une référence
--              au catalogue, si un mot du métier n'est pas dans les fiches, ou si
--              une marque demandée n'est pas distribuée.
-- Effet      : une ligne PAR TERME (et non par recherche), avec un compteur.
--              Une même recherche répétée incrémente `search_count` au lieu de
--              créer une ligne : la table reste petite et directement lisible,
--              et on ne conserve aucune trace individuelle.
--
-- Conformité LPD — choix de conception :
--   * AUCUN identifiant : ni user_id, ni session_id, ni IP, ni empreinte, même
--     hachée. Une recherche n'est donc rattachable à personne, y compris par
--     recoupement — c'est plus strict que consent_logs, qui doit prouver un
--     consentement individuel alors qu'ici seul l'agrégat a une utilité.
--   * `term` est tronqué à 100 caractères et normalisé en minuscules.
--   * Les saisies ressemblant à une donnée personnelle (adresse e-mail, numéro
--     de téléphone, IBAN) sont écartées côté applicatif AVANT insertion : une
--     cliente qui se trompe de champ ne doit pas laisser ses coordonnées ici.
--     Voir services/searchLog.service.js.
--   * Rétention : purge des termes non revus depuis 12 mois (voir la requête
--     d'entretien en fin de fichier).
-- ============================================================

CREATE TABLE IF NOT EXISTS search_no_results (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Terme normalisé (minuscules, espaces réduits) — jamais la saisie brute
  term          VARCHAR(100) NOT NULL,
  locale        ENUM('fr','de','en') NOT NULL DEFAULT 'fr',
  -- Nombre de fois que ce terme a été cherché sans résultat
  search_count  INT UNSIGNED NOT NULL DEFAULT 1,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Un terme n'existe qu'une fois par locale : l'insertion se fait en
  -- « INSERT ... ON DUPLICATE KEY UPDATE », donc sans lecture préalable ni
  -- risque de doublon entre deux requêtes simultanées.
  UNIQUE KEY uq_search_term (term, locale),
  -- Tri de l'admin : les termes les plus demandés d'abord
  KEY idx_search_count (search_count),
  -- Purge de rétention et vue « récent » de l'admin
  KEY idx_search_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Entretien — à exécuter périodiquement (rétention 12 mois) :
--   DELETE FROM search_no_results WHERE last_seen_at < NOW() - INTERVAL 12 MONTH;
