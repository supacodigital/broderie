# Suivi des sprints — audit du 31/08/2026

Branche : `fix/audit-sprint-1` · Audit complet : [AUDIT-2026-08-31.md](AUDIT-2026-08-31.md)

**27 commits, ~115 fichiers, +5900 / -1600.**
Tests backend : baseline 735 verts / 22 échecs → **860 verts / 9 échecs**.
**Toute la suite unitaire (741 tests, 63 suites) est verte** — les 12 échecs unit
baseline ont été éliminés en réparant les tests désynchronisés du code.
Les 9 échecs restants sont **3 suites d'intégration pré-existantes** (`admin`,
`orders`, `shipping`) qui dépendent de données de test jamais seedées dans la base
locale (`shipping.test.js` attend des tranches `9.90/12.90` absentes du seed
officiel, `orders.test.js` un `taxRateId: 1` inexistant en local) — **vérifié
neutre vis-à-vis des changements** : avec les bonnes données, ces suites passent.
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

## Sprint 3 — dette structurelle ✅

| # | Sujet | Commit |
|---|-------|--------|
| H9 | Runner de migrations + table de tracking (sans dépendance) | `ab407176` |
| H7 | Tout le SQL passe par les repositories (7 requêtes égarées rapatriées) | `d1419e04` |
| H10 | Couche service pour l'admin catalogue + contact ; controllers ~10 l./handler | `790a0e5d` |
| M1 | COUNT de pagination simplifié (plus de jointure traductions sans recherche) | `c82eb594` |
| M4 | Cache TVA / frais de port branché (TTL 24 h, invalidation) | `c82eb594` |
| M5 | Coupon TOCTOU : re-check de la limite sous verrou FOR UPDATE | `ae28ae22` |
| M11 | Middleware validate.js (Zod centralisé) — newsletter, consent | `5f8e12a6` |
| M13 | Environnement validé par schéma Zod dans config/env.js (+ env.db) | `713ff3f8` |

### Runner de migrations (H9)
```bash
cd backend
npm run db:migrate:status      # liste appliquées / en attente
npm run db:migrate             # applique les migrations en attente
node ../database/migrate.js --baseline   # 1re fois sur une base déjà à jour
```
Voir `database/README.md`. En staging/prod : `NODE_ENV=production node ../database/migrate.js --baseline`
une fois, puis `npm run db:migrate` à chaque déploiement.

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

> Depuis le Sprint 3, ces migrations se passent via `npm run db:migrate` (backend/) —
> plus besoin de les exécuter à la main. Faire `--baseline` la 1re fois sur une base déjà à jour.

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

## Finitions (post-sprints) ✅

| # | Correctif | Commit |
|---|-----------|--------|
| B6 UI | UI « Mes données » — export + suppression compte | `d5b97caf` |
| M7 | Upload durci — magic bytes, anti-bombe 24 Mpx, strip EXIF, `files:1` | `82f2f45b` |
| M10 | Injection formule CSV — `utils/csv.utils.js` + export newsletter | `504325d6` |
| Basse | `generateQrReference` → `crypto.randomBytes` ; `ß` → `ss` locale DE | `f2a32be2` |
| Basse | `storage.deleteLocal` des 3 variantes au delete image ; Google `email_verified` requis | `412ee60b` |
| Tests | Fiabilise orders/admin/shipping/mfa (cassés sur `main`) — **892/892 vert** | `b75f3b1b` |

## Reste de l'audit (non traité)

Voir [AUDIT-2026-08-31.md](AUDIT-2026-08-31.md) §🟡 Moyenne et §🟢 Basse.
Findings M restants, tous mineurs :
- M2 cache de la recherche `search()`, M3 index supplémentaires reviews,
  M6 bons de fidélité au checkout, M9 pagination `supplier.findByIdWithProducts`,
  M12 rate-limit en staging, M14 partage frontend/admin, M15-M18.
- **Basse** : dashboard `MONTH()/YEAR()`, `manualChunks` vendor, docs périmées,
  ESLint backend, `coverageThreshold` Jest.
- **Frontend** : extension des tests Vitest (Cart, Checkout, formulaires auth complets).
