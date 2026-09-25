-- ============================================================
-- Migration : numéro de facture année-mois/numéro — ticket ADM-18
-- Date       : 2026-09-25
-- Contexte   : demande cliente — « Changer le numéro de facture, mettre
--              l'année et le mois plus un numéro EX 2026-09/01 » (Points en
--              suspens), puis « le numéroteur n'est pas le bon (ex. 2026-10...) ».
--
-- Le compteur devient mensuel : période « AAAA-MM » au lieu de « AAAA ». La
-- ligne annuelle existante reste en place mais n'est plus incrémentée : les
-- factures déjà émises (« 2026-000013 ») gardent leur numéro.
--
-- Des factures ont pu être numérotées au format mensuel lors de la toute
-- première version (15.09). Chaque compteur mensuel est aligné sur le plus
-- grand numéro déjà émis pour son mois, sinon le prochain numéro entrerait
-- en collision avec une facture existante.
--
-- Idempotente : MODIFY vers le même type, et GREATEST ne fait jamais reculer
-- un compteur. Aucun point-virgule dans les commentaires.
-- ============================================================

ALTER TABLE invoice_counters MODIFY period CHAR(7) NOT NULL;

INSERT INTO invoice_counters (period, last_seq)
SELECT LEFT(invoice_number, 7), MAX(invoice_seq)
FROM orders
WHERE invoice_number REGEXP '^[0-9]{4}-[0-9]{2}/[0-9]+$' AND invoice_seq IS NOT NULL
GROUP BY LEFT(invoice_number, 7)
ON DUPLICATE KEY UPDATE last_seq = GREATEST(last_seq, VALUES(last_seq));
