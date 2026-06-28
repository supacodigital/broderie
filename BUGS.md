# 🐛 Suivi des bugs — Au Point-Compté

Bugs relevés pendant la recette sur `https://179.237.87.29` (prod par IP).
Mis à jour au fil des tests. Statuts : 🔴 ouvert · 🟡 en cours · 🟢 corrigé · ⚪ à vérifier

---

## Légende des priorités

| Prio | Sens |
|---|---|
| 🔴 P1 | Bloquant — empêche une fonctionnalité clé (commande, paiement, admin) |
| 🟠 P2 | Important — dégrade l'expérience mais contournable |
| 🟡 P3 | Mineur — cosmétique, confort, cas limite |

---

## Bugs ouverts

### BUG-001 — Upload d'image produit échoue (500) 🔴 P1

- **Statut** : 🔴 ouvert
- **Où** : Admin → Produits → édition → ajout d'image
- **Symptôme** : `POST https://179.237.87.29/api/v1/admin/products/233/images` → **500 Internal Server Error**.
  Le produit se crée bien, mais l'image ne s'uploade pas.
- **Contexte technique** : l'upload passe par `multer` → `config/sharp.js` (conversion WebP + 3 tailles
  thumbnail/medium/large) → `config/storage.js` (écriture disque `backend/uploads/products/`).
  `sharp` et `uuid` sont bien en `dependencies` (pas exclus par `--omit=dev`).
- **Causes probables** (par ordre) :
  1. `sharp` : binaire natif `linux-x64` manquant/cassé sur le VPS (cause n°1 d'un 500 à l'upload).
  2. Permissions : `backend/uploads/` non inscriptible par l'utilisateur PM2.
- **Diagnostic à faire (SSH VPS)** :
  ```bash
  cd ~/broderie/backend
  node -e "require('sharp')(Buffer.alloc(0)); console.log('sharp OK')"
  ls -ld uploads uploads/products
  pm2 logs broderie-api --lines 30 --nostream | grep -A15 -i "error\|sharp\|EACCES"
  ```
- **Correctif probable** :
  - si erreur sharp → `npm rebuild sharp` (ou `npm install --os=linux --cpu=x64 sharp`) puis `pm2 reload broderie-api`
  - si EACCES → `mkdir -p uploads/products && chown -R $USER uploads`

### BUG-002 — Le bento home ne respecte pas l'ordre de l'admin 🟠 P2

- **Statut** : 🔴 ouvert
- **Où** : Admin → Produits → « Vitrine home — bento grid » ↔ page d'accueil (section produits phares)
- **Symptôme** : l'ordre/placement des produits dans le bento de la home ne correspond pas
  à ce qui est affiché/attendu dans l'admin. Le produit en « grande carte » n'est pas le bon.
- **Cause racine** : **tris incohérents** entre les deux côtés, sur des critères différents :
  | Côté | Fichier | Tri |
  |---|---|---|
  | Admin (slots) | `admin/src/pages/Products/Products.jsx:760` | `sort=created_at, order=asc` (plus ancien → récent) |
  | Home (bento) | `frontend/src/pages/Home/sections/FeaturedProductsSection.jsx:21` | `sort=updated_at, order=desc` (modifié récemment en tête) |

  → L'aperçu admin et la home ne classent pas les produits pareil. De plus, la home tri par
  `updated_at desc` : **modifier un produit le propulse en position 0** (grande carte) sans contrôle.
- **Cause de fond** : il n'existe **aucune colonne d'ordre explicite** (type `featured_order` / `sort_order`)
  pour la vitrine. L'ordre est implicite et dépend des dates → impossible de le maîtriser depuis l'admin.
- **Correctif proposé** (à valider) :
  - Ajouter une colonne `featured_sort_order` sur `products` (ou réutiliser un champ d'ordre dédié).
  - Admin : permettre de réordonner les 5 slots (drag & drop ou flèches) → persiste `featured_sort_order`.
  - Aligner **les deux requêtes** sur `sort=featured_sort_order, order=asc`.
  - À défaut (correctif minimal rapide) : utiliser le **même tri** des deux côtés en attendant.

---

## Bugs corrigés

### BUG-003 — Rate limit global trop strict (bloque la navigation client) 🟠 P2

- **Statut** : 🟢 corrigé (code) — ⚪ à redéployer + valider en prod
- **Où** : toute navigation client (catalogue, fiches produit, panier, avis)
- **Symptôme** : en navigant normalement côté client, on atteint vite la limite
  « Trop de requêtes, veuillez réessayer plus tard. » (HTTP 429).
- **Cause** : `globalLimiter` à **200 req/15min** sur **tout `/api/`** (`backend/app.js:103`).
  Chaque page catalogue/produit fait plusieurs appels → 200 épuisé en quelques minutes de navigation.
  Le même limiter couvrait à la fois la lecture (volumineuse) et le sensible — mauvais périmètre.
- **Correctif appliqué** : limite globale relevée à **1000 req/15min** (simple garde-fou anti-abus).
  La protection stricte reste séparée sur les routes auth (`routes/auth.routes.js`, max 10/15min)
  → approche « lecture généreuse / sensible strict ». `trust proxy=1` confirmé présent
  (`app.js:40`) donc le comptage se fait bien **par IP réelle** (pas l'IP du proxy Nginx).
- **À faire** : redéployer le backend (`git pull` + `pm2 reload broderie-api`) puis revalider la navigation.

---

## Notes / observations non bloquantes

- **UX** : sur une erreur 429 (rate limit auth), le front affiche « Une erreur est survenue »
  au lieu d'un message « trop de tentatives ». Confort, non bloquant.

---

_Supaco Digital — Au Point-Compté — recette 2026_
