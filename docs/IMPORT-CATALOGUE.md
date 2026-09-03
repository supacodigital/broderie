# IMPORT-CATALOGUE.md — Plan d'action

**Projet : Au Point-Compté** — E-commerce broderie 🇨🇭
**Rédigé le : 2 septembre 2026**
**Source des données : `donnéesclient/` (transmis par la cliente le 1er septembre 2026)**

> Ce document décrit **comment intégrer le catalogue de la cliente** (export de son
> ancien logiciel de gestion) dans la base du projet, **sans rien refaire de ce qui
> existe déjà**. Le principe : on importe ce qu'on a, la cliente complète les champs
> manquants elle-même depuis le back-office.

---

## 1. Contexte

La cliente a fourni 3 fichiers Excel (extraits de son logiciel métier) :

| Fichier | Contenu | Volume |
|---|---|---|
| `V_ArticleC_INT.xlsx` | Liste des articles retenus, déjà filtrée | **15 944 lignes** × 61 colonnes |
| `Gamme.xlsx` | Table des gammes (= marques / éditeurs de kits) | 147 lignes (80 utilisées) |
| `CRFournisseur.xlsx` | Liaison article ↔ fournisseur(s) | 68 571 lignes |

La table des **fournisseurs eux-mêmes** (noms, adresses) **n'a pas été transmise**.
La reprise des ~1800 comptes clients est **annulée** (décision projet).

**Objectif :** peupler la table `products` avec ces ~15 900 articles, en français,
avec le maximum d'informations exploitables. Les traductions DE/EN, les images, les
poids manquants et les catégories fines seront **complétés par la cliente** au fil de
l'eau via le back-office admin (CRUD produit déjà livré).

---

## 2. Ce qui existe déjà — À RÉUTILISER TEL QUEL

Le schéma a été conçu dès le départ pour accueillir ~14 000 produits importés
(voir en-tête de [`database/broderie.sql`](../database/broderie.sql)). **Rien à
refondre.** On réutilise :

| Élément existant | Fichier | Usage à l'import |
|---|---|---|
| Table `products` + `product_translations` (FR/DE/EN) | `database/broderie.sql` | cible principale — **plus aucun produit seedé** (voir §3.3) |
| Table `suppliers` + `products.supplier_id` | `database/broderie.sql` | **laissée vide** (fichier fournisseurs absent ; seed de démo retiré — §3.3) |
| Table `tags` + `tag_translations` + `product_tags` | `database/broderie.sql` | reçoit les **marques** (Gamme) et les **thèmes** |
| Catégories : 5 racines + 16 sous-catégories **déjà seedées** | `database/broderie.sql` (Kits de Broderie, Fils Coton, Toiles & Supports…) | cible du mapping catégorie |
| `tax_rates` seedés (8.1 / 2.6 / 3.8) | `database/broderie.sql` | 99,99 % des articles = taux normal 8.1 |
| CRUD produit admin (form nom/desc **FR+DE+EN**, SKU, poids, dimensions, badge, tags, fournisseur, upload images WebP ×3) | [`admin/src/pages/Products/ProductForm.jsx`](../admin/src/pages/Products/ProductForm.jsx) | la cliente complète ici |
| Repository d'écriture produit (transaction atomique) | [`backend/repositories/product.admin.repository.js`](../backend/repositories/product.admin.repository.js) | référence pour les requêtes du script |
| Runner de migrations SQL sans ORM | [`database/migrate.js`](../database/migrate.js) | applique la migration additive |
| Bloc « optimisation après import en masse » (ANALYZE, rebuild FULLTEXT) | [`database/broderie.sql`](../database/broderie.sql) (fin de fichier) | à exécuter une fois après import |

Le système gère **déjà autrement** (donc **exclus de l'import**) :
- les **rabais / bons cadeau / cartes fidélité** → tables `coupons`, `loyalty_*`
- les **frais de port** → tables `shipping_rates`
- ⇒ les ~13 lignes du fichier de gamme « Rabais » / « Port et emballage » ne sont **pas** des produits.

---

## 3. Le vrai delta — LES FICHIERS D'INTÉGRATION

Fichiers créés (tout le reste est réutilisé) :

| Fichier | Rôle |
|---|---|
| `database/migrations/2026-09-02_products_import_fields.sql` | Migration additive : `products.external_ref` + `products.ean` |
| `database/migrations/2026-09-03_users_reset_token.sql` | Migration additive : `users.reset_token_hash` + `reset_token_expires` (bug de schéma préexistant révélé au rechargement — voir §3.4) |
| `database/lib/xlsx-reader.js` | Lecteur `.xlsx` minimal sans dépendance |
| `database/catalog-category-map.js` | Correspondance marque (Gamme) → catégorie + gammes exclues |
| `database/import-catalog.js` | Script d'import (filtrage, mapping, UPSERT, tags, rapport, garde-fous slug **et SKU**) |
| `backend/package.json` | Script npm `import:catalog` ajouté |
| `database/broderie.sql` | Colonnes `external_ref` / `ean` + `reset_token_*` répercutées ; **seed produit/fournisseur de démo retiré** (§3.3) |
| `.gitignore` | `donnéesclient/` et `database/backups/` exclus du dépôt |

### 3.1 — Migrations additives

Deux migrations, format identique aux existantes (gardes `information_schema`,
idempotentes, `PREPARE`/`EXECUTE`, staging puis prod après backup).

**`2026-09-02_products_import_fields.sql`**

| Colonne ajoutée à `products` | Type | Rôle |
|---|---|---|
| `external_ref` | `VARCHAR(32) NULL` + `UNIQUE KEY uq_products_external_ref` | Stocke le `NArticleC` d'origine. **C'est la clé anti-doublon** : rejouer l'import met à jour au lieu de dupliquer. |
| `ean` | `VARCHAR(20) NULL` + `INDEX idx_products_ean` | Code-barres (rempli sur 28 % des articles). Utile SEO / scan douchette. Index non unique (3 doublons EAN dans la source). |

**`2026-09-03_users_reset_token.sql`** (voir §3.4 — bug de schéma préexistant)

| Colonne ajoutée à `users` | Type | Rôle |
|---|---|---|
| `reset_token_hash` | `VARCHAR(64) NULL` | Jeton SHA-256 hex de réinitialisation de mot de passe (déjà utilisé par le code, jamais versionné). |
| `reset_token_expires` | `DATETIME NULL` | Échéance du jeton ci-dessus. |

> **Pas de nouvelle table, pas de colonne `brand`.** Les marques passent par `tags`
> (le filtre catalogue par tag est déjà codé : `product.repository.js` → `filters.tagId`).

**Optionnel (hors périmètre, à voir plus tard) :** exposer `ean` dans le `ProductForm`
admin. Non bloquant — la colonne est alimentée par l'import.

### 3.2 — Script d'import

**Fichier :** `database/import-catalog.js` — sans dépendance de parsing (lecteur XLSX
maison dans `database/lib/xlsx-reader.js` ; `mysql2`/`dotenv` empruntés à
`backend/node_modules` comme `migrate.js`).

**Modes (toujours depuis `backend/`) :**
```
npm run import:catalog -- --dry-run          # rapport complet, n'écrit rien
npm run import:catalog                        # exécute l'import (UPSERT sur external_ref)
npm run import:catalog -- --status            # compte les produits déjà importés
npm run import:catalog -- --with-theme-tags   # crée aussi ~4000 tags "thème" (OFF par défaut)
```

> **Tags thème désactivés par défaut :** la colonne `Thèmes` contient ~4000 mots-clés
> distincts en vrac — les créer tous saturerait la page Tags de l'admin. Par défaut
> l'import ne crée que les **~80 tags de marque**. La cliente peut lancer une fois avec
> `--with-theme-tags` si elle veut le filtrage thématique complet.

**Étapes internes :**

1. **Lecture** de `V_ArticleC_INT.xlsx` (`Gamme` sert via la table de correspondance ;
   `CRFournisseur` non utilisé — table fournisseurs absente).
2. **Filtrage** — un article est retenu si **toutes** ces conditions sont vraies :
   - `Actif` = true (31 exclus)
   - `PrixVente` numérique et > 0 (19 exclus), et ≤ 10 000 (1 exclu — solde après inventaire)
   - `PourTest` = 0 (355 exclus — fiches de test internes)
   - `Stock` ≤ 100 000 (2 exclus — valeurs aberrantes de l'export : `3.01e24`, `135 600.45`)
   - gamme hors liste d'exclusion : `Rabais`, `Port et emballage`, `Non classé`,
     `Catalogues divers`, `Livres divers`, `Divers`, `Divers Arcalaine` (52 exclus)
   → reste **~15 500 articles publiables** (dry-run réel : 15 497).
3. **Mapping** vers `products` (voir §4).
4. **Traductions** : `product_translations` locale `fr` uniquement (nom = `LArticle`,
   description = `RemarqueFr`). **Aucune ligne DE/EN créée** — la cliente les ajoutera.
5. **Tags** :
   - **Par défaut** : 1 tag `marque-<slug>` par gamme (ex. `marque-lanarte`), libellé
     identique en fr/de/en (nom de marque). ~80 tags.
   - **Avec `--with-theme-tags`** : tags depuis `Thèmes` (CSV nettoyé : trim,
     dédoublonnage, on ignore les fragments purement numériques et ceux < 3 caractères).
     ~4000 tags — désactivé par défaut.
   - liaison via `product_tags` (PK `(product_id, tag_id)` → `INSERT IGNORE` idempotent).
6. **Catégorie** : `products.category_id` résolu via `database/catalog-category-map.js`
   (voir §5). Défaut si marque non mappée : `kits-de-broderie` (~80 articles concernés).
7. **Garde-fous d'unicité** — `products` a **3 clés UNIQUE** : `external_ref`, `slug`, `sku`.
   L'UPSERT ne doit se déclencher que sur `external_ref` (ré-import). Les deux autres
   sont neutralisées **avant** l'INSERT :
   - **slug** : `slugify(LArticle)` + suffixe `-2`, `-3`… en cas de collision (avec un
     autre article du run **ou** une fiche déjà en base). Dry-run réel : ~1 580 suffixés.
   - **sku** (`RefFab`) : si le SKU est déjà pris par une fiche **sans `external_ref`**
     (créée à la main dans l'admin) → **ligne exclue**, signalée au rapport (on ne
     touche jamais une fiche hors import). Si le même `RefFab` apparaît sur 2 lignes de
     l'export → la 2ᵉ est exclue. Catalogue actuel : **0 cas** (tous les SKU sont uniques).
   - filet de sécurité dans le SQL : `external_ref` **est** dans le `ON DUPLICATE KEY
     UPDATE` — si une collision passait quand même, la fiche touchée devient une vraie
     fiche d'import (jamais une fiche « fantôme » sans `external_ref`, invisible aux
     ré-imports et au comptage).
8. **UPSERT** : `INSERT ... ON DUPLICATE KEY UPDATE`. Un article déjà importé est
   **mis à jour**, jamais dupliqué. Sur un ré-import :
   - **rafraîchi** : `external_ref`, `price_chf`, `compare_price_chf`, `stock`, `sku`,
     `tax_rate_id`, `is_made_to_order`, `category_id`, `name` FR
   - **préservé si déjà rempli** (`COALESCE(existant, nouveau)`) : `weight_kg`, `ean`,
     `length_cm`, `width_cm`, `description` FR
   - **jamais touché** : `is_featured`, `featured_order`, `badge`, `supplier_id`, images,
     traductions DE/EN, `slug` (l'URL d'un produit déjà en ligne ne change pas)
9. **Batch de 500** (`INSERT INTO ... VALUES (...), (...), ...`) — jamais ligne par ligne.
10. **Transaction unique** : tout l'import (tags + produits + traductions + liaisons) est
    dans une seule transaction — rollback complet en cas d'erreur.
11. **Post-import** (affiché en fin de script, à lancer à la main sur MySQL) :
    `ANALYZE TABLE products; ANALYZE TABLE product_translations; ANALYZE TABLE product_tags;`

### 3.3 — Seed produit de `broderie.sql` retiré

`database/broderie.sql` seedait **77 produits de démo** (Caron, DMC Coloris, Madeira,
45 kits Lanarte — source `database/products.md`). Ces fiches partageaient leurs `sku`
(`RefFab`) et leurs `slug` avec des articles de l'export de la cliente.

Résultat au premier import réel : l'`INSERT ... ON DUPLICATE KEY UPDATE` matchait sur
`uq_products_sku` (et non `external_ref`, absent du `SET` à l'époque) → **27 fiches de
démo écrasées** (prix / stock / catégorie remplacés par ceux de l'export) et **27
articles de l'export sans fiche propre**. Un ré-import ne les rattrapait jamais
(re-match SKU). Le `--dry-run` ne pouvait pas le voir (il ne teste pas les contraintes
`UNIQUE`).

**Décision :** le catalogue a **une source unique — l'import**. Tout le seed
produit / fournisseur de démo est retiré de `broderie.sql` (remplacé par un commentaire
explicatif). Conséquences :
- `broderie.sql` from scratch → 0 produit, 0 fournisseur, catégories/TVA/tags seedés.
- Plus aucune collision possible entre seed et import.
- Les fournisseurs : la cliente les crée dans l'admin (§7) — `products.supplier_id` NULL au départ.
- Aucun test cassé : les tests d'intégration récupèrent un produit via l'API
  (`GET /products?limit=1`) et s'adaptent à une base vide ou pleine ; les e2e génèrent
  leurs propres données.
- Le script garde malgré tout le garde-fou SKU (§3.2 étape 7) pour les ré-imports et
  les produits créés à la main.

### 3.4 — Bug de schéma préexistant corrigé (`users.reset_token_*`)

Le rechargement de `broderie.sql` de zéro (pour repartir propre avant le ré-import) a
révélé que **`users.reset_token_hash` et `users.reset_token_expires` n'ont jamais été
dans le schéma versionné** (ni `schema.sql`, ni `broderie.sql`), alors que le code les
utilise depuis le premier commit (`auth.service.js` forgot/reset password,
`user.repository.js`, purge LPD dans `DELETE /users/me`). Les bases de dev historiques
les avaient ; une base neuve non → `Unknown column 'reset_token_hash'` (HTTP 500) sur
`/auth/forgot-password`, `/auth/reset-password`, `DELETE /users/me`.

**Correctif :** migration `database/migrations/2026-09-03_users_reset_token.sql`
(`VARCHAR(64)` + `DATETIME`, sur le modèle exact de `verify_token_hash` /
`verify_token_expires`), répercutée dans `CREATE TABLE users`. Idempotente, à jouer
sur staging puis prod comme les autres. **Hors périmètre import** mais bloquant pour
un déploiement from scratch — corrigé au passage.

---

## 4. Matrice de mapping V_ArticleC → `products`

| Colonne source | Cible | Traitement | Si vide |
|---|---|---|---|
| `NArticleC` | `products.external_ref` | tel quel | — (toujours présent) |
| `LArticle` | `product_translations.name` (fr) | trim | — (toujours présent) |
| `RefFab` | `products.sku` | trim | — (100 % rempli, 100 % unique ✓) |
| `LArticle` (dérivé) | `products.slug` + `product_translations.slug` (fr) | `slugify` (NFD, minuscules, tirets) + suffixe `-2`, `-3`… si collision | — |
| `PrixVente` | `products.price_chf` | `roundCHF()` | article exclu |
| `PrixVenteFutur` | `products.compare_price_chf` | **si** `> PrixVente` → prix barré ; sinon `NULL` | `NULL` |
| `TvaVente` | `products.tax_rate_id` | `8.1` → id taux normal ; `0` → taux normal aussi (1 seule ligne, cas de solde) | taux normal |
| `Stock` | `products.stock` | `parseInt`, plancher à 0 | 0 |
| `Stock` = 0 **et** `SurInternet` = 1 | `products.is_made_to_order` = 1 | article commandable sans stock | 0 |
| `PoidsG` (÷ 1000) ou `PoidsKgVrai` | `products.weight_kg` | priorité `PoidsKgVrai` si > 0, sinon `PoidsG`/1000 | `NULL` → **cliente complète** |
| `Largeur` | `products.width_cm` | `parseFloat` | `NULL` |
| `Longueur` | `products.length_cm` | `parseFloat` | `NULL` |
| `RemarqueFr` | `product_translations.description` (fr) | trim | `NULL` → **cliente complète** |
| `RemarqueEn` | *(rien)* | vide à 100 % dans la source | **cliente crée la trad EN** |
| `EAN` | `products.ean` | trim ; 2e occurrence d'un même code → `NULL` (6 cas) | `NULL` |
| `Nom_Gamme` | tag `marque-<slug>` via `product_tags` + `products.category_id` (via `catalog-category-map.js`) | — | catégorie défaut |
| `Thèmes` | tags via `product_tags` **si `--with-theme-tags`** | split `,` + nettoyage | aucun tag |
| `Actif` | filtre d'inclusion (pas stocké) — `is_active` = 1 pour tous les importés | `true` → retenu | exclu si `false` |
| `pu_*`, `IdTrame`, `IdArtist`, `BestSeller`, `PageCatAct`, `Année`, dates, `NCollection`… | *(rien pour l'instant)* | métadonnées métier sans cible actuelle | — |

**Champs `products` non alimentés par l'import** (valeur par défaut du schéma, cliente
les gère ensuite) : `supplier_id` (NULL), `is_featured` (0), `featured_order` (NULL),
`badge` (NULL), images (aucune), traductions DE/EN.

### Colonnes booléennes de l'export — usage

L'export a plusieurs indicateurs oui/non (`t="b"` dans le XML, stockés `0`/`1`). Seuls
`Actif` et `SurInternet` sont utilisés :

| Colonne | Répartition (sur 15 944) | Utilisée à l'import ? |
|---|---|---|
| `Actif` | 15 913 vrai / **31 faux** | ✅ filtre d'inclusion — `false` → exclu |
| `SurInternet` | 15 859 vrai / 85 faux | ✅ `false` + stock 0 ⇒ ni publié ni « sur commande » ; sinon `is_made_to_order` si stock 0 |
| `Disponible` | 15 178 / 766 | ❌ ignoré (redondant avec stock) |
| `EOL` (fin de vie) | 174 vrai | ❌ ignoré — la cliente désactive à la main si besoin |
| `PrixModifiable`, `JusquEpuisementStock`, `HorsInventaire`, `Canevas coloré/imprimé`, `EstVariante` | — | ❌ pas de cible |
| `PourTest` (0–5, pas un vrai booléen) | 355 ≠ 0 | ✅ filtre — `≠ 0` → exclu |

---

## 5. Table de correspondance Gamme → Catégorie

**Fichier :** `database/catalog-category-map.js`

Les 80 gammes sont des **marques**, pas des catégories thématiques. `Nom_Collection` est
inexploitable (99,5 % = « Divers »). D'où cette correspondance manuelle.

État actuel (dry-run réel) — répartition des ~15 500 articles retenus :

| Catégorie cible | Articles | Marques types |
|---|---|---|
| `kits-de-broderie` | ~10 500 | Lanarte, Vervaco, Riolis, RTO, Permin, Bonheur des Dames, Eva Rosenstand, Artibalta… |
| `grilles-et-modeles` | ~2 350 | Renato Parolin, Lili Points, Isabelle Vautier, Points Com, Éditions de Saxe… |
| `fils-coton` | ~975 | DMC Art.117, DMC hors Art.117, Anchor, Cosmo |
| `broderie-diamant` | ~860 | Wizardi, Diamond Dotz, Collection d'Art |
| `toiles-au-metre-et-coupons` | ~300 | Zweigart, DMC Toile, Wichelt |
| `aiguilles-et-rangement` | ~290 | Bohin, Prym, Pako |
| `bandes-et-galons` | ~100 | La Stéphanoise, Rico |
| `articles-prets-a-broder` | ~85 | Stafil, Sudberry |
| autres (`perles-et-tresors`, `petite-mercerie`, `fils-effets-speciaux`, `confort-et-optique`) | ~60 | Mill Hill, Au Ptit Bonheur, Caron, Daylight |
| **`kits-de-broderie` (défaut, marque non mappée)** | **~80** | 15 petites marques (Vaupel, Princesse, Marie-Coeur…) |

> **À faire valider par la cliente** : le fichier liste ~90 marques. Toute marque absente
> tombe sur `kits-de-broderie`. La cliente peut **reclasser n'importe quel produit**
> ensuite depuis le `ProductForm` (champ Catégorie). Les gammes `Rabais`,
> `Port et emballage`, `Non classé`, `Catalogues divers`, `Livres divers`, `Divers` sont
> dans `EXCLUDED_GAMME_NAMES` → **exclues de l'import**.

---

## 6. Ce que la cliente complétera elle-même (post-import)

Aucune action de dev requise — tout est déjà dans le back-office :

| Champ à compléter | Volume concerné | Où dans l'admin |
|---|---|---|
| **Traductions DE + EN** (nom + description) | ~15 500 (100 %) | ProductForm → sections « Allemand » / « Anglais » |
| **Poids** (`weight_kg`) | ~11 250 (73 %) | ProductForm → champ « Poids (kg) » — **nécessaire aux frais de port** |
| **Description FR** | ~1 990 (13 %) | ProductForm → « Description (FR) » |
| **Images produit** | ~15 500 (100 %) | ProductForm → zone d'upload (WebP ×3 auto) |
| **Catégorie fine** | ~80 sur défaut + reclassements souhaités | ProductForm → « Catégorie » |
| **Produits vedettes / badges** | au choix | ProductForm + drag & drop vitrine home |
| **Fournisseur** | tous | ProductForm → « Fournisseur » *(quand la table sera créée)* |

---

## 7. Point ouvert — fournisseurs

`CRFournisseur.xlsx` ne contient que des **identifiants numériques** de fournisseurs
(133 distincts), pas leurs noms/adresses. La table `Fournisseur` n'a pas été transmise.

**Décision :** on importe le catalogue **sans** `supplier_id`. Deux options ensuite :
1. La cliente **re-transmet le fichier fournisseurs** → un second script fait la liaison
   (`CRFournisseur` donne déjà `NArticleC → NFournisseur`, il ne manque que les noms).
2. La cliente **crée ses fournisseurs à la main** dans l'admin (CRUD déjà livré) et les
   rattache aux produits progressivement.

Ce point **ne bloque pas** l'import du catalogue.

---

## 8. Séquence d'exécution

### En local / staging (obligatoire d'abord)

```bash
# 1. Placer les 3 .xlsx de la cliente dans donnéesclient/ (à la racine du projet)

# 2. Backup de la base (chemin MAMP local : /Applications/MAMP/Library/bin/mysql80/bin/)
mysqldump --single-transaction --routines --triggers broderie \
  > database/backups/backup_avant_import_$(date +%F).sql   # database/backups/ est gitignored

# 3. Migrations additives (external_ref + ean, reset_token_*)
cd backend
npm run db:migrate:status        # 2 migrations en attente
npm run db:migrate               # les appliquer

# 4. Import à blanc — RELIRE le rapport (articles retenus/exclus, motifs,
#    répartition catégories, complétude, collisions slug/SKU, EAN doublons)
npm run import:catalog -- --dry-run

# 5. Import réel  (attendu : 15 497 créés, 0 mis à jour sur une base neuve)
npm run import:catalog

# 6. Optimisation post-import (le script rappelle les commandes en fin d'exécution)
#    Sur MySQL : ANALYZE TABLE products; ANALYZE TABLE product_translations; ANALYZE TABLE product_tags;

# 7. Vérifs
#    - COUNT(*) products = 15 497, tous avec external_ref, tous avec 1 traduction fr
#    - 0 doublon slug / sku / external_ref ; 0 produit sans category_id / tax_rate_id
#    - boutique : catalogue s'affiche, filtre par marque (tag marque-xxx) OK, recherche OK
#    - admin : liste produits (15 497), édition d'une fiche (tags marque visibles), upload image
#    - EXPLAIN sur la requête catalogue type → idx_products_active_cat / _active_price utilisé
#    - npm run import:catalog -- --status   → doit afficher 15 497
```

> **Base locale déjà polluée par d'anciens tests ?** Repartir propre reproduit l'état
> de staging : `DROP DATABASE broderie; CREATE DATABASE broderie …;` puis recharger
> `database/broderie.sql`, puis `npm run db:migrate -- --baseline` (les migrations
> sont déjà répercutées dans `broderie.sql`), puis `npm run db:migrate` pour les
> éventuelles nouvelles. Enfin l'import.

### En production

Identique, **après** validation complète sur staging, backup préalable, hors heures de
trafic (`NODE_ENV=production` pour charger `.env.production`). Le `--dry-run` doit être
rejoué sur la prod avant l'import réel.

```bash
cd backend
NODE_ENV=production npm run db:migrate            # applique les 2 migrations additives
NODE_ENV=production npm run import:catalog -- --dry-run
NODE_ENV=production npm run import:catalog
```

### Ré-imports ultérieurs (nouvelle livraison de la cliente)

Rejouer simplement `npm run import:catalog`. Grâce à `external_ref` :
- articles connus → **mise à jour** prix / stock / compare_price / sku / catégorie / nom FR
- articles nouveaux → **création**
- champs enrichis par la cliente (`weight_kg`, `ean`, dimensions, description FR, DE/EN,
  images, `is_featured`, `badge`, `supplier_id`, `slug`) → **préservés**
- un article dont le `RefFab` entre en collision avec une fiche créée à la main (sans
  `external_ref`) → **exclu**, listé dans le rapport (jamais d'écrasement silencieux)

---

## 9. Checklist de livraison — import catalogue

**Fichiers d'intégration (faits) :**
- [x] Migration `database/migrations/2026-09-02_products_import_fields.sql` (idempotente, gardes `information_schema`)
- [x] `database/lib/xlsx-reader.js` — lecteur XLSX sans dépendance
- [x] `database/catalog-category-map.js` — correspondance marque → catégorie
- [x] `database/import-catalog.js` — modes `--dry-run` / `--status` / `--with-theme-tags` + garde-fous slug/SKU
- [x] `database/migrations/2026-09-03_users_reset_token.sql` — bug de schéma préexistant (§3.4)
- [x] `backend/package.json` — script `import:catalog`
- [x] `database/broderie.sql` — `external_ref` / `ean` / `reset_token_*` répercutés + **seed produit de démo retiré** (§3.3)
- [x] `.gitignore` — `donnéesclient/` + `database/backups/` exclus

**Exécution — local (fait le 3 sept. 2026) :**
- [x] Base locale rechargée de zéro (`broderie.sql` + `--baseline` + migrations)
- [x] `--dry-run` relu : 15 497 retenus / 447 exclus / 0 collision SKU / ~1 580 slugs suffixés
- [x] Import réel : **15 497 créés, 0 doublon**, tous avec `external_ref` + traduction FR + tag marque
- [x] `ANALYZE TABLE` exécuté
- [x] `EXPLAIN` catalogue : `idx_products_active_price` utilisé, requête liste 3 ms, filtre tag 1 ms
- [x] API testée : liste (`total: 15497`), recherche `q=lanarte`, filtres catégorie/stock/prix, détail par slug
- [x] Admin testé : `findAllAdmin` (15 497), `findByIdAdmin` (tags marque + trad FR + desc FR)
- [x] Suite de tests backend : **892/892 verts**

**Exécution — staging puis prod (à faire) :**
- [ ] Table de correspondance Gamme → Catégorie relue/validée avec la cliente (`catalog-category-map.js`)
- [ ] Backup staging → 2 migrations appliquées → `--dry-run` relu → import réel → `ANALYZE TABLE`
- [ ] `npm run import:catalog -- --status` sur staging = 15 497
- [ ] Boutique + admin validés sur staging (catalogue, recherche, filtre marque, édition fiche, upload image)
- [ ] Import rejoué à blanc sur staging → 0 doublon créé (validation clé `external_ref`)
- [ ] Backup prod → 2 migrations → `--dry-run` → import réel → `ANALYZE TABLE` (hors trafic, `NODE_ENV=production`)
- [ ] Doc remise à la cliente : « comment compléter poids / traductions / images »

---

## 10. Résumé — effort

| Tâche | Nature | Effort | État |
|---|---|---|---|
| Migration `external_ref` + `ean` | SQL, modèle existant | 🟢 Faible | ✅ fait |
| Lecteur XLSX + script d'import + map catégories | code neuf, ~650 lignes | 🟡 Moyen | ✅ fait |
| Garde-fous collision slug/SKU + seed produit retiré | correctif suite 1er import | 🟢 Faible | ✅ fait |
| Migration `users.reset_token_*` (bug schéma préexistant) | SQL, modèle existant | 🟢 Faible | ✅ fait |
| Import local validé (15 497 produits, 892 tests verts) | procédure §8 | 🟢 Faible | ✅ fait |
| Validation map Gamme → Catégorie avec la cliente | ~90 lignes à relire | 🟢 Faible | ⬜ dépend d'elle |
| Exécution staging + prod | procédure §8 | 🟢 Faible | ⬜ |
| **Refonte schéma / CRUD / admin** | **AUCUNE** | — | — |

Tout le reste (fiches produit, traductions, images, catégories fines, fournisseurs,
vedettes) est **du remplissage back-office par la cliente**, sans intervention dev.
