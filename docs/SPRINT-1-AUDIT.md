# Sprint 1 — Correctifs bloquants de l'audit du 31/08/2026

Branche : `fix/audit-sprint-1` · Plan : voir l'audit complet [AUDIT-2026-08-31.md](AUDIT-2026-08-31.md)

**8 commits, 38 fichiers, +1698 / -139.** Tests : baseline 735 verts → **791 verts** (+56),
les 22 échecs restants sont pré-existants sur `main` (suites unit admin/supplier/category +
intégration orders/admin/mfa/shipping désynchronisées — hors périmètre).

---

## État des 9 bloquants

| # | Sujet | Commit | Statut |
|---|-------|--------|--------|
| B1 | TVA : produits au taux hôtelier 3.8 % → normal 8.1 % | `3194b3f6` | ✅ code + migration appliquée en local |
| B2 | IDOR paiement (PaymentIntent d'un tiers) | `9b86c2f8` | ✅ |
| B3 | Avis : achat requis + validation Zod + unicité | `496c0564` | ✅ code + migration appliquée en local |
| B4 | Facture : n° TVA vendeur + garde IBAN test | `dd89b4d9` | ✅ (voir décision TVA ci-dessous) |
| B5 | Facture : ventilation TVA par taux | `dd89b4d9` | ✅ |
| B6 | Endpoints LPD export + suppression compte | `7b76ae91` | ✅ |
| B8 | Garde anti-placeholder secrets JWT | `c56a9bd6` | ✅ secrets `.env` dev régénérés |
| B9 | Consentement cookies jamais enregistré | `12cef65c` | ✅ code + migration appliquée en local |
| B7 | Purge historique git + rotation secrets | `b9f7043d` | ⏳ **guide écrit — exécution manuelle par Kevin** |

---

## À faire avant de merger / déployer

### Migrations à passer sur staging puis production
Dans l'ordre, après backup :
1. `database/migrations/2026-09-01_fix_products_tax_rate_standard.sql` (B1)
2. `database/migrations/2026-09-01_consent_logs_accepted.sql` (B9)
3. `database/migrations/2026-09-01_reviews_unique_user_product.sql` (B3)
4. `database/migrations/2026-09-01_lpd_account_deletion.sql` (B6 — **no-op**, juste une requête d'audit)

Toutes idempotentes (gardes `information_schema`), rejouables sans erreur.
`database/broderie.sql` est déjà à jour pour un déploiement from-scratch.

### Variables d'environnement
- `QR_INVOICE_VAT_NUMBER` (nouveau) : à renseigner dans `.env.production` **si** Julie est
  assujettie TVA (CA ≥ CHF 100 000) — format `CHE-XXX.XXX.XXX TVA`. Sinon laisser vide.
- Secrets JWT `.env.production` : déjà de vraies valeurs distinctes, rien à faire. Le nouveau
  garde-fou `app.js` refuse tout secret placeholder / < 32 car. / non distinct au démarrage.

### Décision produit en attente (ne bloque pas le merge)
**Julie est-elle assujettie à la TVA ?**
- **Oui** → renseigner `QR_INVOICE_VAT_NUMBER`, la facture est complète.
- **Non** → correctif séparé à faire : masquer toute mention de TVA (facture PDF + récap
  checkout + CGV) tant que le seuil n'est pas atteint. Le code actuel affiche la ventilation
  TVA dans tous les cas.

### B7 — exécution manuelle
Suivre `docs/PURGE-GIT-B7.md` : rotation Stripe test + Mailtrap **d'abord**, puis
`git filter-repo` + `push --force` sur les 3 branches, puis re-clone équipe + VPS.
À faire **après** le merge de cette branche (sinon le force-push complique la PR).

### Vérifs manuelles recommandées
| # | Test |
|---|------|
| B1 | `SELECT p.sku, tr.rate FROM products p JOIN tax_rates tr ON tr.id=p.tax_rate_id LIMIT 5` → `8.10` |
| B2 | 2 comptes, commande de A, B `POST /payments/card/<id A>` → `404` |
| B3 | compte sans achat → avis `403` ; acheteur → `201` ; 2e avis → `409` |
| B5 | facture d'une commande → ligne `TVA 8.10 % incluse : CHF …` (plus de taux composite) |
| B6 | `GET /users/me/export` → JSON complet ; `DELETE /users/me` + mdp → compte anonymisé, commande conservée, re-login `401` |
| B9 | `POST /consent {accepted:false}` → ligne en base avec `accepted=0` |

---

## Frontend — impact

- **B3** : `ReviewsSection.jsx` affiche déjà `{r.title}`/`{r.body}` en JSX (échappé) — RAS.
  Le compteur front affiche « / 1000 », le backend valide désormais `max(1000)` — cohérent.
- **B6** : les endpoints `GET /users/me/export` et `DELETE /users/me` existent mais **aucune
  UI ne les appelle encore**. À ajouter dans l'espace compte (page « Mes données » : bouton
  télécharger + bouton supprimer avec ré-saisie du mot de passe). → Sprint 2 ou tâche front dédiée.
- **B9** : `CookieBanner.jsx` / `consent.service.js` envoient déjà le bon payload — RAS.

---

## Hors périmètre (audit — sprints suivants)

Voir [AUDIT-2026-08-31.md](AUDIT-2026-08-31.md) §🟠 Haute et §🟡 Moyenne :
H1 token_version · H2 HMAC IP consent (le hash SHA-256 nu reste, `req.ip` est déjà en place) ·
H3 sanitize champs publics · H4/H5 perf catalogue · H6 idempotence webhook · H8 CSP ·
H10 couche service admin · H12 tests frontend · UI « Mes données » (B6).
