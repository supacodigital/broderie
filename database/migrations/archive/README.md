# Migrations archivées

Ces 13 migrations couvrent l'évolution du schéma entre juillet et septembre 2026.
**Elles sont toutes déjà intégrées dans `database/broderie.sql`** — une base créée
depuis ce fichier est identique à une base ayant subi toutes ces migrations.

Elles ont été déplacées ici le 14 septembre 2026, avant la première mise en
production. `database/migrate.js` ne lit que `migrations/*.sql` à plat : les
fichiers de ce sous-dossier sont donc invisibles pour le runner.

## Pourquoi les avoir sorties du chemin

Aucune base n'a jamais été déployée en production. Ces migrations ne pouvaient
donc plus s'appliquer qu'à une base de développement ancienne — un cas qui ne se
présente plus.

Les garder actives créait deux ennuis concrets :

1. **Un `--baseline` obligatoire à ne pas oublier.** Sur une base neuve montée
   depuis `broderie.sql`, la table `schema_migrations` est vide : un premier
   `npm run db:migrate` aurait rejoué les 13 migrations.
2. **Deux d'entre elles touchent des données, pas seulement le schéma** —
   `2026-09-01_reviews_unique_user_product.sql` (supprime des avis en double) et
   `2026-09-02_products_rating_denormalized.sql` (recalcule les notes sur toute
   la table). Les rejouer par accident n'était pas anodin.

`broderie.sql` est désormais la source unique du schéma.

## Si vous devez en rejouer une

Cas concret : une base de développement créée avant septembre 2026 qui traînerait
sur un poste. Remettre le fichier concerné dans `database/migrations/` puis :

```bash
cd backend && npm run db:migrate
```

Le plus simple reste cependant de repartir de `broderie.sql`.

## Pour la suite

Toute **nouvelle** évolution du schéma se fait comme avant : un fichier daté dans
`database/migrations/`, répercuté dans `broderie.sql`. Ce dossier d'archive ne
concerne que l'historique antérieur au premier déploiement.
