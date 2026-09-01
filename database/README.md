# Base de données — schéma & migrations

## Fichiers

| Fichier | Rôle |
|---|---|
| `broderie.sql` | **Schéma de référence complet** + données de seed. Un déploiement *from scratch* exécute ce seul fichier — il reflète toujours l'état actuel, migrations incluses. |
| `migrations/*.sql` | Modifications incrémentales à appliquer sur une base **déjà déployée**. Nommées `AAAA-MM-JJ_slug.sql`, appliquées dans l'ordre alphabétique. |
| `migrate.js` | Runner de migrations (sans dépendance, sans ORM). |

> ⚠️ `broderie.sql` et `migrations/` doivent rester cohérents : toute migration doit
> aussi être répercutée dans `broderie.sql` pour que le chemin *from scratch* ne diverge pas.

## Historique

Les migrations `001_*` → `012_*` (mai–juillet 2026) ont été **consolidées dans `broderie.sql`**
lors du nettoyage `ca261ea9` (juillet 2026) — `broderie.sql` en est le snapshot. Les migrations
présentes ici partent du **31 juillet 2026**. Pour retrouver une ancienne migration :
`git show ca261ea9^:database/migrations/00X_*.sql`.

## Runner de migrations

Toujours lancé **depuis `backend/`** (il utilise `backend/node_modules` et `backend/.env`) :

```bash
cd backend

npm run db:migrate:status   # liste appliquées ✅ / en attente ⬜
npm run db:migrate          # applique les migrations en attente (transaction par migration)
```

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
