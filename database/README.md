# Base de données — schéma & migrations

## Fichiers

| Fichier | Rôle |
|---|---|
| `broderie.sql` | **Schéma de référence complet** + données de seed. Un déploiement *from scratch* exécute ce seul fichier — il reflète toujours l'état actuel, migrations incluses. |
| `migrations/*.sql` | Modifications incrémentales à appliquer sur une base **déjà déployée**. Nommées `AAAA-MM-JJ_slug.sql`, appliquées dans l'ordre alphabétique. |
| `migrate.js` | Runner de migrations (sans dépendance, sans ORM). |
| `import-catalog.js` | Import du catalogue de la cliente (`donnees-client/*.xlsx`) dans `products`. UPSERT sur `products.external_ref` → rejouable sans doublon. |
| `catalog-category-map.js` | Correspondance marque (Gamme) → catégorie, utilisée par l'import. À faire valider par la cliente. |
| `lib/xlsx-reader.js` | Lecteur `.xlsx` minimal sans dépendance (utilisé par `import-catalog.js`). |

> ⚠️ `broderie.sql` et `migrations/` doivent rester cohérents : toute migration doit
> aussi être répercutée dans `broderie.sql` pour que le chemin *from scratch* ne diverge pas.

## Historique

Deux consolidations successives, même principe à chaque fois : `broderie.sql` absorbe
les migrations et en devient le snapshot.

- **Juillet 2026** — migrations `001_*` → `012_*` (mai–juillet) consolidées lors du
  nettoyage `ca261ea9`. Pour en retrouver une : `git show ca261ea9^:database/migrations/00X_*.sql`.
- **14 septembre 2026** — les 13 migrations du 31 juillet au 10 septembre déplacées dans
  `migrations/archive/` (voir le README de ce dossier), avant la première mise en production.

Conséquence pratique : `migrations/` est vide, et **`broderie.sql` suffit à monter une base
complète et à jour**. Plus besoin de `--baseline` après un chargement from scratch — le
runner affiche directement `0 en attente`.

Les nouvelles évolutions du schéma reprennent le fonctionnement normal décrit ci-dessous.

## Runner de migrations

Toujours lancé **depuis `backend/`** (il utilise `backend/node_modules` et `backend/.env`) :

```bash
cd backend

npm run db:migrate:status   # liste appliquées ✅ / en attente ⬜
npm run db:migrate          # applique les migrations en attente (transaction par migration)
```

## Import du catalogue cliente

Toujours lancé **depuis `backend/`**, après les migrations additives
(`2026-09-02_products_import_fields.sql`, `2026-09-03_users_reset_token.sql`).
Les 3 `.xlsx` doivent être dans `donnees-client/` (hors dépôt Git). `broderie.sql` ne
seede **aucun produit** — le catalogue vient uniquement de cet import.

```bash
cd backend

npm run import:catalog -- --dry-run          # rapport complet, n'écrit rien (à relire d'abord)
npm run import:catalog                        # exécute l'import (UPSERT sur external_ref)
npm run import:catalog -- --status            # compte les produits déjà importés
```

La matrice de mapping détaillée est documentée en tête de `import-catalog.js`.

### Import des photos produit

Les photos sont livrées par la cliente en **lots de 3 000 fichiers**
(`donnees-client/Lot_Photo_web_01`, `_02`, …), accompagnés du
`Rapport_Audit_Photos.xlsx` qui porte la correspondance article ↔ photo :

| Colonne | Rôle |
| --- | --- |
| `NArticleC` | clé d'appariement — correspond à `products.external_ref` |
| `RefFab` | référence fabricant — correspond à `products.sku` |
| `Nom Fichier` | nom exact du fichier dans le lot |
| `Conforme Web` | `OK` / `Photo Manquante` / `Taille > 5Mo` — seules les lignes `OK` sont importées |
| `Lot Destination` | lot contenant le fichier |

`import-catalog-photos.js` accepte ce fichier directement (`--format=auto` le
détecte) et cherche les photos dans **plusieurs lots séparés par une virgule** :

```bash
cd backend

npm run import:catalog-photos -- --dry-run \
  --excel=../donnees-client/Rapport_Audit_Photos.xlsx \
  --photos=../donnees-client/Lot_Photo_web_01,../donnees-client/Lot_Photo_web_02

npm run import:catalog-photos -- \
  --excel=../donnees-client/Rapport_Audit_Photos.xlsx \
  --photos=../donnees-client/Lot_Photo_web_01,../donnees-client/Lot_Photo_web_02
```

Points à connaître :

- **Relançable sans risque** : un produit ayant déjà au moins une image est
  ignoré. À chaque nouveau lot, relancer la même commande en ajoutant le
  dossier — seules les photos nouvelles sont traitées.
- Les fichiers annoncés dans l'audit mais absents du disque sont comptés
  **par lot** dans le rapport : un lot entier absent = lot pas encore livré,
  ce n'est pas une erreur.
- La casse de l'extension varie dans les lots (`.jpg` / `.JPG`) ; la résolution
  du fichier est insensible à la casse.
- Le pipeline est celui de l'upload admin : WebP, 3 tailles
  (200/600/1200 px), ~1 Go pour 8 600 photos.
- Les photos source ne dépassent pas 1000 px de large : `withoutEnlargement`
  fait que les tailles `medium`/`large` sont souvent identiques. Fonctionnel,
  mais ~19 % de stockage redondant si l'on veut optimiser plus tard.

Options directes :

```bash
node ../database/migrate.js --dry-run    # montre ce qui serait appliqué, sans exécuter
node ../database/migrate.js --baseline   # marque TOUT comme appliqué sans exécuter
                                         # — UNIQUEMENT sur une base déjà à jour
                                         #   (mise en place initiale du runner)
```

Le runner crée une table `schema_migrations (filename, applied_at)` et n'applique que
les fichiers absents de cette table. Chaque migration tourne dans **sa propre transaction** :
en cas d'erreur, rollback + arrêt (les migrations suivantes ne sont pas tentées).

### Mise en place sur une base existante (staging / prod)

La première fois, si la base est **déjà à jour** (schéma = `broderie.sql`) :

```bash
cd backend
NODE_ENV=production node ../database/migrate.js --baseline   # marque les 9 migrations existantes
```

Ensuite, à chaque déploiement :

```bash
cd backend
NODE_ENV=production npm run db:migrate
```

## Écrire une migration

- Nom : `AAAA-MM-JJ_slug_court.sql` (la date sert au tri).
- En-tête : bloc de commentaire `Contexte / Effet / Sûr car / Idempotent / À exécuter`.
- **Idempotente** : MySQL 8 n'a pas `ADD COLUMN IF NOT EXISTS` — utiliser une garde
  `information_schema` + `PREPARE`/`EXECUTE` (voir les migrations existantes comme modèle),
  ou `CREATE TABLE IF NOT EXISTS`.
- Répercuter le changement dans `broderie.sql`.
