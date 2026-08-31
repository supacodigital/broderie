# Suivi des sprints — audit du 31/08/2026

Branche : `fix/audit-sprint-1` · Audit complet : [AUDIT-2026-08-31.md](AUDIT-2026-08-31.md)

**19 commits, ~71 fichiers, +4100 / -337.**
Tests backend : baseline 735 verts → **817 verts** (+82). Les 22 échecs restants sont
**pré-existants sur `main`** (suites unit admin/supplier/category + intégration
orders/admin/mfa/shipping désynchronisées du code — hors périmètre de ces sprints).
Tests frontend : 0 → **20** (Vitest + Testing Library mis en place).

---

## Sprint 1 — 9 bloquants ✅

| # | Sujet | Commit |
|---|-------|--------|
| B1 | TVA : produits au taux hôtelier 3.8 % → normal 8.1 % | `3194b3f6` |
| B2 | IDOR paiement (PaymentIntent d'un tiers) | `9b86c2f8` |
| B3 | Avis : achat requis + validation Zod + unicité | `496c0564` |
| B4 | Facture : n° TVA vendeur + garde IBAN test | `dd89b4d9` |
| B5 | Facture : ventilation TVA par taux | `dd89b4d9` |
| B6 | Endpoints LPD export + suppression compte | `7b76ae91` |
| B8 | Garde anti-placeholder secrets JWT | `c56a9bd6` |
| B9 | Consentement cookies jamais enregistré | `12cef65c` |
| B7 | Purge historique git + rotation secrets | `b9f7043d` (⏳ **exécution manuelle par Kevin** — voir `PURGE-GIT-B7.md`) |

## Sprint 2 — 9 findings Haute ✅

| # | Sujet | Commit |
|---|-------|--------|
| H1 | Invalidation session au changement de mot de passe (token_version) | `7994ca6f` |
| H2 | Hash IP consent : SHA-256 nu → HMAC + pepper dédié | `08e3c668` + `26a7d946` |
| H3 | Validation/bornage des champs admin publiés (catégories, tags, CGV) | `f7772992` |
| H4 | Perf catalogue : dénormalisation note produit (plus de GROUP BY) | `01413229` |
| H5 | srcset mort sur la fiche produit (findBySlug) | `cfdc4770` |
| H6 | Webhook Stripe idempotent (plus de double crédit fidélité) | `b36d5b24` |
| H8 | CSP : retrait de unsafe-eval / unsafe-inline (scripts) | `07fded73` |
| H11 | Email vérifié requis pour commander / laisser un avis | `6a808152` |
| H12 | Outillage Vitest + Testing Library sur la boutique | `f4001ffa` |

---

## Migrations à passer (staging → prod, après backup)

Toutes idempotentes (gardes `information_schema`), rejouables sans erreur.
`database/broderie.sql` est déjà à jour pour un déploiement from-scratch.

**Sprint 1 :**
1. `2026-09-01_fix_products_tax_rate_standard.sql`
2. `2026-09-01_consent_logs_accepted.sql`
3. `2026-09-01_reviews_unique_user_product.sql`
4. `2026-09-01_lpd_account_deletion.sql` *(no-op — requête d'audit)*

**Sprint 2 :**
5. `2026-09-02_users_token_version.sql`
6. `2026-09-02_stripe_webhook_events.sql`
7. `2026-09-02_products_rating_denormalized.sql` *(initialise rating_avg/rating_count + 2 index)*

Après le passage de la #7 en prod avec des données réelles, contrôler :
`SELECT COUNT(*) FROM products WHERE rating_count > 0;` doit correspondre au nombre
de produits ayant au moins un avis approuvé.

---

## Variables d'environnement à ajouter en production

| Variable | Sprint | Notes |
|----------|--------|-------|
| `QR_INVOICE_VAT_NUMBER` | 1 (B4) | `CHE-XXX.XXX.XXX TVA` **si** Julie est assujettie (CA ≥ CHF 100 000). Sinon vide. |
| `CONSENT_IP_PEPPER` | 2 (H2) | `openssl rand -base64 48` — **obligatoire** (le serveur refuse de démarrer sans, comme les secrets JWT). |

Les secrets JWT de `.env.production` sont déjà de vraies valeurs distinctes — le nouveau
garde-fou `app.js` (B8) vérifie juste qu'aucun n'est un placeholder / trop court / dupliqué.

---

## À revalider en staging (comportement navigateur)

- **H8 (CSP)** : login Google + chargement des polices Google Fonts + navigation complète.
  La CSP stricte casserait un `eval()` runtime d'une dépendance (aucune connue). Console
  navigateur = zéro violation CSP attendue.
- **H1** : changer son mot de passe depuis l'espace compte → rester connecté (le front
  adopte le nouvel access token), un autre onglet ouvert doit se déconnecter au prochain refresh.
- **H4** : temps de réponse `/api/v1/products` sur le catalogue réel (cible p95 < 200 ms).

---

## Frontend — travail restant (hors sprints)

- **B6** : les endpoints `GET /users/me/export` et `DELETE /users/me` existent, **aucune UI
  ne les appelle**. À ajouter : page « Mes données » dans l'espace compte (bouton télécharger
  + bouton supprimer avec ré-saisie du mot de passe).
- **H12** : la base de tests est posée (20 tests). À étendre selon CLAUDE.md §11 :
  Cart, Checkout, RegisterForm/LoginForm complets, ReviewsSection.

---

## À confirmer avant déploiement

**Julie est-elle assujettie à la TVA (CA ≥ CHF 100 000/an) ?**
- Oui → renseigner `QR_INVOICE_VAT_NUMBER`, la facture est complète.
- Non → correctif séparé à faire : masquer toute mention de TVA (facture PDF + récap
  checkout + CGV) tant que le seuil n'est pas atteint. Le code actuel affiche la ventilation.

---

## Reste de l'audit (non traité — sprints suivants)

Voir [AUDIT-2026-08-31.md](AUDIT-2026-08-31.md) §🟡 Moyenne et §🟢 Basse :
- **Sprint 3 (structurel)** : H7 (SQL hors repositories), H9 (outil de migrations),
  H10 (couche service admin), M1-M18.
- **Continu** : docs (BACKEND.md, claude_task.md, CLAUDE.md §2), ESLint backend,
  `coverageThreshold` Jest, UI « Mes données », extension des tests frontend.
