# Déploiement — Modifications base de données

Ce document liste **uniquement les modifications à apporter à la base de données** pour
les développements de cette session. Les changements backend/frontend (code) ne sont pas
couverts ici — ils sont déployés par le processus habituel (`git pull` + rebuild).

> ⚠️ **Ne jamais exécuter une migration directement en production : staging d'abord.**
> Ordre : **backup → staging → validation → production**.

---

## 0. Avant toute migration — sauvegarde

- [ ] **Backup de la base de production** (panel Infomaniak → base → exporter, ou `mysqldump`)
- [ ] Vérifier que le backup est complet et téléchargé

---

## 1. Migrations à exécuter (dans l'ordre)

Deux migrations sont à jouer, dans cet ordre :

| Ordre | Fichier | Objet |
| --- | --- | --- |
| 1 | `database/migrations/009_add_billing_address.sql` | Adresse de facturation distincte |
| 2 | `database/migrations/010_add_email_verification.sql` | Vérification de l'adresse email |

**Comment les exécuter (au choix) :**

- **phpMyAdmin (panel Infomaniak)** : onglet « Importer » → sélectionner le fichier `.sql` → Exécuter (une migration à la fois, dans l'ordre)
- **En SSH** :
  ```bash
  mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < database/migrations/009_add_billing_address.sql
  mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < database/migrations/010_add_email_verification.sql
  ```

---

## 2. Détail des migrations

### 2.1 — `009_add_billing_address.sql` (adresse de facturation)

Non destructif — ajout de colonnes `NULL` uniquement.

- Table `orders` : ajoute `shipping_first_name`, `shipping_last_name`,
  `billing_first_name`, `billing_last_name`, `billing_street`, `billing_city`,
  `billing_zip`, `billing_country`, `billing_canton`
- Table `addresses` : ajoute `address_type ENUM('shipping','billing','both')`,
  `first_name`, `last_name`

> ℹ️ Rejouable sans risque. Les anciennes commandes auront `billing_*` à `NULL` :
> la facture QR retombe automatiquement sur l'adresse de livraison (fallback prévu dans le code).

### 2.2 — `010_add_email_verification.sql` (vérification email)

Non destructif — ajout de colonnes + un `UPDATE` de mise à niveau des comptes existants.

- Table `users` : ajoute `email_verified_at`, `verify_token_hash`, `verify_token_expires`
- **`UPDATE` inclus** : marque **tous les comptes existants comme déjà vérifiés**
  (`email_verified_at = created_at`) — les 1800 clients migrés ne verront donc **pas**
  le bandeau « confirmez votre email ».

> ℹ️ Seuls les comptes créés **après** la migration devront confirmer leur email.

---

## 3. Vérifications après migration (staging puis production)

Après **009** :

```sql
SHOW COLUMNS FROM orders   LIKE 'billing%';   -- doit lister 7 colonnes billing_*
SHOW COLUMNS FROM addresses LIKE 'address_type';
```

Après **010** :

```sql
SHOW COLUMNS FROM users LIKE 'email_verified_at';
-- Tous les comptes existants doivent être marqués vérifiés :
SELECT COUNT(*) AS total, COUNT(email_verified_at) AS verifies FROM users;
-- total et verifies doivent être égaux
```

**Checklist :**

- [ ] Backup de production effectué
- [ ] `009` jouée sur **staging** + colonnes vérifiées
- [ ] `010` jouée sur **staging** + comptes existants tous vérifiés
- [ ] Parcours validés sur staging (checkout facturation + inscription/vérif email)
- [ ] `009` jouée sur **production**
- [ ] `010` jouée sur **production**
- [ ] Vérifications SQL ci-dessus OK en production

---

## 4. Rollback base de données (si problème)

Les colonnes ajoutées sont `NULL` et **non lues par l'ancien code** : un rollback du **code**
suffit généralement, sans toucher à la base.

Si une suppression de colonnes est vraiment nécessaire (⚠️ **supprime les données associées**) :

```sql
-- Migration 009
ALTER TABLE orders DROP COLUMN shipping_first_name, DROP COLUMN shipping_last_name,
  DROP COLUMN billing_first_name, DROP COLUMN billing_last_name, DROP COLUMN billing_street,
  DROP COLUMN billing_city, DROP COLUMN billing_zip, DROP COLUMN billing_country, DROP COLUMN billing_canton;
ALTER TABLE addresses DROP COLUMN address_type, DROP COLUMN first_name, DROP COLUMN last_name;

-- Migration 010
ALTER TABLE users DROP COLUMN email_verified_at, DROP COLUMN verify_token_hash, DROP COLUMN verify_token_expires;
```

---

## Récapitulatif express

| Ordre | Migration | Destructif ? | Note |
| --- | --- | --- | --- |
| 1 | `009_add_billing_address.sql` | Non | Colonnes NULL, fallback code prévu |
| 2 | `010_add_email_verification.sql` | Non | Marque les comptes existants comme vérifiés |

_Aucune nouvelle variable d'environnement ni dépendance npm côté base de données._
