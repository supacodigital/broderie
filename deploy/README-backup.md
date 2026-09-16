Écrit pour : la personne qui administre le VPS broderie.ch.

# Sauvegarde automatique — ticket ADM-11

Demande de la cliente : « Mettre en place un back-up quotidien, sauf pour les
photos : faire le back-up une fois par mois. »

## Pourquoi deux rythmes

| Volume | Taille | Rythme | Raison |
| --- | --- | --- | --- |
| Base de données | ~22 Mo (≈2 Mo gzippé) | quotidien | Tout ce qui change : commandes, clients, stock, prix |
| Photos produits | ~2.8 Go | mensuel | Ne bougent qu'à l'ajout d'un lot |

Le VPS n'a que **7.5 Go libres**. Archiver 2.8 Go de photos chaque nuit le
remplirait en trois jours et arrêterait MySQL — donc la boutique.

⚠️ **Il n'existe aucun agent de sauvegarde Infomaniak sur ce VPS** (vérifié le
2026-09-16). La sauvegarde MySQL automatique d'Infomaniak concerne leurs
hébergements gérés, pas un VPS que l'on administre soi-même. Ce script est donc
la seule protection.

## Installation

```bash
# 1. Copier le script sur le serveur (depuis le dépôt, déjà présent après un git pull)
sudo cp /var/www/broderie.ch/deploy/backup-broderie.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup-broderie.sh

# 2. Vérifier qu'il fonctionne AVANT de l'automatiser
sudo /usr/local/bin/backup-broderie.sh db
ls -lh ~/backups/db-*.sql.gz | tail -2

# 3. Programmer les deux tâches (crontab de root : accès à /etc/mysql/debian.cnf)
sudo crontab -e
```

Ajouter ces deux lignes :

```cron
# Sauvegarde base broderie.ch — tous les jours à 03h15
15 3 * * * /usr/local/bin/backup-broderie.sh db >> /var/log/backup-broderie.log 2>&1
# Sauvegarde photos — le 1er de chaque mois à 04h00
0 4 1 * * /usr/local/bin/backup-broderie.sh photos >> /var/log/backup-broderie.log 2>&1
```

Horaires choisis de nuit : le dump ne verrouille pas la boutique
(`--single-transaction`), mais l'archive photos consomme du disque et du CPU.

## Vérifier que ça tourne

```bash
sudo crontab -l                      # les deux lignes sont là
tail -20 /var/log/backup-broderie.log
ls -lht ~/backups/ | head            # une archive db-* par jour
```

## Rétention

- **30 jours** d'historique quotidien de la base (≈60 Mo)
- **1 archive photos** (2.7 Go), remplacée chaque mois

⚠️ Une seule archive photos est conservée, et c'est une contrainte du disque, pas
un choix : elle pèse 2.7 Go pour ~7.5 Go libres — en garder deux est impossible
(mesuré le 2026-09-16). L'ancienne est donc supprimée **avant** de créer la
nouvelle. Conséquence à assumer : pendant la minute où l'archive se reconstruit,
il n'y a pas de copie des photos sur le serveur. Les photos d'origine restent
disponibles en local, ce qui rend le risque acceptable — mais si la cliente veut
un vrai historique photos, il faut agrandir le disque ou externaliser.

La rotation de la base est automatique : les archives les plus anciennes sont
supprimées après création de la nouvelle.

## Garde-fous intégrés

- **Refus si moins de 2 Go libres** : un disque plein arrête MySQL et met la
  boutique hors ligne. Mieux vaut une sauvegarde manquée qu'un site à l'arrêt.
- **Contrôle de taille du dump** : une archive de moins de 100 Ko signale un
  dump incomplet. Elle est supprimée et le script sort en erreur, plutôt que de
  laisser croire à une sauvegarde valide.
- **`set -o pipefail`** : sans lui, `mysqldump | gzip` renverrait le code de
  gzip et un dump en échec passerait pour un succès.

## Restaurer

```bash
# Base (⚠️ écrase les données actuelles — faire un dump avant)
gunzip -c ~/backups/db-20260916-031500.sql.gz | sudo mysql broderie

# Photos
sudo tar -xzf ~/backups/photos-202609.tar.gz -C /var/www/broderie.ch/backend/
```

## Limite à connaître

Les sauvegardes restent **sur le même disque que le site**. Elles protègent
d'une erreur humaine ou d'une corruption de données, pas d'une perte du VPS
lui-même. Une copie hors-site (Infomaniak Swiss Backup, ou un `rsync` vers un
autre hôte) reste à mettre en place si la cliente veut ce niveau de garantie —
c'est une décision à prendre avec elle, avec un coût associé.
