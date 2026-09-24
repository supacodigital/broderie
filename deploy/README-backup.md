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

⚠️ **Infomaniak ne sauvegarde pas les VPS** (« Infomaniak does not perform any
backups of Cloud VPS / VPS Lite » — FAQ Infomaniak). La sauvegarde repose donc
sur ce script, avec une copie hors serveur vers Swiss Backup (voir plus bas).

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

- **30 jours** d'historique quotidien de la base (≈60 Mo), en local et hors serveur
- Photos : **12 mois hors serveur** (Swiss Backup). L'archive locale ci-dessous
  ne concerne que le fonctionnement sans copie hors serveur ; dès que celle-ci
  est en place, l'archive locale n'est plus créée et l'ancienne est supprimée.
- Sans copie hors serveur : **1 archive photos** locale (2.7 Go), remplacée chaque mois

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

## Copie hors serveur — Swiss Backup (Infomaniak)

Les copies locales restent sur le même disque que le site : elles protègent
d'une erreur ou d'une corruption, pas d'une perte du serveur. Elles partent donc
aussi, chaque nuit, vers **Swiss Backup** (abonnement BK-1676312-1, appareil S3
« serveur-broderie », 50 Go) : 3 copies dans les centres de données
d'Infomaniak en Suisse.

- **Outil** : restic — chiffrement sur le serveur AVANT l'envoi (clé que nous
  seuls détenons), historique, vérification d'intégrité.
- **Base + configuration du site** (`backend/.env`, `.env.production` du site
  et de l'admin, `/etc/nginx/sites-available`) : chaque nuit, **30 jours**.
- **Photos** : le 1er du mois, **12 mois** (seules les photos nouvelles occupent
  de la place). L'archive photos locale n'est plus créée.
- **Alerte e-mail** à chaque échec (adresse enregistrée à l'installation).
- Contrôle d'intégrité du dépôt chaque mois.

### Installation (une seule fois)

1. Manager Infomaniak → Swiss Backup → serveur-broderie → Informations de
   connexion → **Générer des nouvelles clés**.
2. Sur le serveur, depuis un terminal :
   ```bash
   sudo bash /var/www/broderie.ch/deploy/setup-offsite-backup.sh
   ```
   Il demande l'Access Key, la Secret Key (masquée) et l'adresse d'alerte, crée la
   clé de chiffrement, fait les premières copies puis **une restauration test**.
3. **Copier la clé de chiffrement hors du serveur** (gestionnaire de mots de
   passe) : `sudo cat /root/.config/broderie-backup/restic.key`. Sans elle, les
   copies sont illisibles — y compris pour nous.

Accès et clé : `/root/.config/broderie-backup/` (lisible par root seulement).

### Consulter les copies

```bash
sudo bash -c 'set -a; . /root/.config/broderie-backup/offsite.env; set +a; restic snapshots'
```

### Serveur perdu — tout restaurer sur un nouveau serveur

1. Nouveau VPS, `sudo apt install restic`.
2. Recréer `/root/.config/broderie-backup/offsite.env` (clés Swiss Backup) et
   `restic.key` (depuis le gestionnaire de mots de passe), puis charger :
   `set -a; . /root/.config/broderie-backup/offsite.env; set +a`
3. Configuration et dernière base :
   `restic restore latest --tag db --host broderie --target /`
4. Photos : `restic restore latest --tag photos --host broderie --target /`
5. Code : `git clone` dans `/var/www/broderie.ch`, installation comme au
   premier déploiement, puis import de la base :
   `gunzip -c /home/ubuntu/backups/db-<date>.sql.gz | sudo mysql broderie`

Pour une date précise : `restic snapshots` puis `restic restore <ID> …`.

## En cas de fuite de données

Obligations nLPD : informer le PFPDT dans les meilleurs délais en cas de risque
élevé pour les personnes concernées, et informer celles-ci si nécessaire. Les
copies hors serveur étant chiffrées, un accès au stockage Swiss Backup ne suffit
pas à lire les données.
