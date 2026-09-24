#!/bin/bash
# ============================================================
# Sauvegarde automatique broderie.ch — ticket ADM-11
#
# Deux rythmes, parce que les deux volumes n'ont rien à voir :
#   - base de données : ~22 Mo (dump gzippé ~2 Mo) → TOUS LES JOURS
#   - photos produits : ~2.8 Go                    → UNE FOIS PAR MOIS
#
# C'est exactement la demande de la cliente : « tous les jours, sans les
# photos ; le back-up des photos une fois par mois ». Sauvegarder 2.8 Go
# chaque nuit remplirait les 7.5 Go libres du VPS en trois jours.
#
# Les données qui changent (commandes, clients, stock, prix) sont dans la
# base : c'est elle qui doit être protégée quotidiennement. Les photos ne
# bougent qu'à l'ajout d'un lot, et restent disponibles en local chez nous.
#
# COPIE HORS SERVEUR (Swiss Backup, Infomaniak) — une fois configurée par
# deploy/setup-offsite-backup.sh, chaque sauvegarde part aussi, chiffrée, vers
# le stockage Swiss Backup : 3 copies dans les centres de données d'Infomaniak
# en Suisse, ailleurs que sur ce serveur. Sans elle, une panne ou une perte du
# serveur emporterait les sauvegardes avec le site (ADM-11 : « où sont stockées
# les copies ? »). L'envoi est fait par restic : chiffrement avec une clé que
# nous seuls détenons, historique, vérification d'intégrité.
#   - base : dump + configuration du site, chaque nuit — 30 jours conservés ;
#   - photos : le 1er du mois — 12 mois conservés (seules les photos
#     nouvelles occupent de la place).
# Tant que la copie hors serveur n'est pas configurée, le script garde son
# fonctionnement d'origine (copies locales uniquement).
#
# En cas d'échec, un e-mail d'alerte part à l'adresse BACKUP_ALERT_TO.
#
# Usage :
#   backup-broderie.sh db      # dump SQL quotidien
#   backup-broderie.sh photos  # sauvegarde mensuelle des photos
#
# Installation : voir deploy/README-backup.md
# ============================================================

# -E : le piège d'erreur (alerte e-mail) s'applique aussi dans les fonctions
set -Eeuo pipefail

BACKUP_DIR="/home/ubuntu/backups"
DB_NAME="broderie"
UPLOADS_DIR="/var/www/broderie.ch/backend/uploads"
# Identifiants Debian : permet un dump non interactif sans mot de passe en clair
MYSQL_DEFAULTS="/etc/mysql/debian.cnf"

# Rétention — en nombre de fichiers conservés
KEEP_DB=30      # 30 jours d'historique quotidien (≈ 60 Mo)
# Une seule archive photos : elle pèse 2.7 Go et le VPS n'a que ~7.5 Go libres.
# En conserver deux serait impossible — mesuré le 2026-09-16. À augmenter
# seulement si le disque est agrandi.
KEEP_PHOTOS=1

# Copie hors serveur — fichier écrit par setup-offsite-backup.sh (lisible par
# root seulement) : accès S3 Swiss Backup, dépôt restic, clé de chiffrement,
# adresse d'alerte.
OFFSITE_ENV="/root/.config/broderie-backup/offsite.env"
SITE_DIR="/var/www/broderie.ch"
# Configuration nécessaire pour reconstruire le site sur un nouveau serveur :
# secrets de l'application (base, paiement, e-mail) et configuration nginx.
# Chiffrée par restic avant de quitter le serveur.
CONFIG_PATHS=(
  "$SITE_DIR/backend/.env"
  "$SITE_DIR/frontend/.env.production"
  "$SITE_DIR/admin/.env.production"
  "/etc/nginx/sites-available"
)
LOG_FILE="/var/log/backup-broderie.log"
CURRENT_STEP=""

# Garde-fou : ne jamais lancer une sauvegarde qui remplirait le disque.
# Un disque plein arrête MySQL et met la boutique hors ligne — le remède
# serait pire que le mal.
MIN_FREE_MB=2048

timestamp() { date +%Y%m%d-%H%M%S; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

offsite_enabled() { [ -f "$OFFSITE_ENV" ]; }

# Charge les accès Swiss Backup et la clé du dépôt dans l'environnement de restic
load_offsite() {
  set -a
  # shellcheck disable=SC1090
  . "$OFFSITE_ENV"
  set +a
}

# Alerte e-mail, envoyée par l'application (sa configuration d'envoi). Ne doit
# jamais faire échouer le script à son tour.
alert() {
  local to="${BACKUP_ALERT_TO:-}"
  if [ -z "$to" ] && offsite_enabled; then
    to=$(grep -E '^BACKUP_ALERT_TO=' "$OFFSITE_ENV" | cut -d= -f2- | tr -d "'\"") || true
  fi
  [ -n "$to" ] || return 0
  ( cd "$SITE_DIR/backend" \
      && node -r dotenv/config scripts/notify-backup-failure.js "$to" "$CURRENT_STEP" "$LOG_FILE" ) || true
}

# Toute erreur non rattrapée (set -e) déclenche l'alerte avant la sortie
on_error() {
  local code=$?
  log "ERREUR (code $code) pendant : ${CURRENT_STEP:-sauvegarde}"
  alert
  exit "$code"
}
trap on_error ERR

free_mb() { df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}'; }

check_space() {
  local free
  free=$(free_mb)
  if [ "$free" -lt "$MIN_FREE_MB" ]; then
    log "ERREUR : seulement ${free} Mo libres (minimum ${MIN_FREE_MB} Mo). Sauvegarde annulée."
    alert
    exit 1
  fi
}

backup_db() {
  check_space
  local out="$BACKUP_DIR/db-$(timestamp).sql.gz"

  # --single-transaction : dump cohérent sans verrouiller la boutique
  # (InnoDB) — les clientes peuvent commander pendant la sauvegarde.
  # `pipefail` (set -o en tête) est indispensable ici : sans lui, le code
  # retour du pipe serait celui de gzip, et un mysqldump en échec passerait
  # pour un succès — on archiverait du vide sans le savoir.
  if ! mysqldump --defaults-file="$MYSQL_DEFAULTS" \
       --single-transaction --routines --triggers \
       "$DB_NAME" | gzip > "$out"; then
    log "ERREUR : le dump a échoué"
    rm -f "$out"
    alert
    exit 1
  fi

  # Une archive vide ou minuscule signale un dump raté que le code retour
  # n'a pas signalé (pipe : c'est gzip qui renvoie 0, pas mysqldump).
  local size
  size=$(stat -c%s "$out")
  if [ "$size" -lt 100000 ]; then
    log "ERREUR : archive suspecte (${size} octets) — dump probablement incomplet"
    rm -f "$out"
    alert
    exit 1
  fi

  log "Base sauvegardée : $(basename "$out") ($(du -h "$out" | cut -f1))"

  # Rotation : ne garder que les KEEP_DB plus récentes
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_DB + 1)) | while read -r old; do
    rm -f "$old"
    log "Purge : $(basename "$old")"
  done

  if offsite_enabled; then
    CURRENT_STEP="base de données — copie hors serveur (Swiss Backup)"
    load_offsite
    local paths=("$out")
    for p in "${CONFIG_PATHS[@]}"; do
      [ -e "$p" ] && paths+=("$p")
    done
    restic backup --quiet --tag db --host broderie "${paths[@]}"
    # 30 jours d'historique hors serveur, comme en local. `--group-by host,tags` :
    # sans lui, restic regroupe par chemin — or chaque dump a un nom différent,
    # chaque nuit formerait son propre groupe et rien ne serait jamais purgé.
    restic forget --quiet --tag db --host broderie --group-by host,tags --keep-daily 30 --prune
    log "Copie hors serveur (Swiss Backup) : base et configuration envoyées"
  fi
}

backup_photos() {
  if offsite_enabled; then
    backup_photos_offsite
    return 0
  fi

  check_space
  local out="$BACKUP_DIR/photos-$(date +%Y%m).tar.gz"

  if [ -f "$out" ]; then
    log "Archive photos du mois déjà présente — rien à faire."
    return 0
  fi

  # Les anciennes archives sont supprimées AVANT de créer la nouvelle : à
  # 2.7 Go pièce et ~4.8 Go libres, le disque ne peut pas en porter deux
  # simultanément. Purger après aurait fait échouer le tar par manque de place.
  #
  # On garde (KEEP_PHOTOS - 1) archives, la nouvelle complétant le compte.
  # Le tri se fait sur le nom (photos-AAAAMM), pas sur la date du fichier :
  # `ls -t` départage mal deux fichiers de même horodatage et laissait
  # survivre une archive de trop — ce qui saturait le disque.
  local keep_existing=$((KEEP_PHOTOS - 1))
  ls -1r "$BACKUP_DIR"/photos-*.tar.gz 2>/dev/null \
    | tail -n +$((keep_existing + 1)) \
    | while read -r old_archive; do
        rm -f "$old_archive"
        log "Purge (avant création) : $(basename "$old_archive")"
      done

  if ! tar -czf "$out" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"; then
    log "ERREUR : l'archive photos a échoué"
    rm -f "$out"
    alert
    exit 1
  fi

  log "Photos sauvegardées : $(basename "$out") ($(du -h "$out" | cut -f1))"
}

# Photos envoyées directement chez Swiss Backup, sans archive locale : à 2.7 Go,
# l'archive occupait plus du tiers de l'espace libre du serveur, et elle n'est
# plus nécessaire dès que la copie hors serveur existe. restic n'envoie que les
# photos nouvelles ou modifiées depuis le mois précédent.
backup_photos_offsite() {
  CURRENT_STEP="photos — copie hors serveur (Swiss Backup)"
  load_offsite
  restic backup --quiet --tag photos --host broderie "$SITE_DIR/backend/uploads"
  restic forget --quiet --tag photos --host broderie --group-by host,tags --keep-monthly 12 --prune
  # Contrôle mensuel de l'intégrité du dépôt (structure et index)
  restic check --quiet
  log "Copie hors serveur (Swiss Backup) : photos envoyées, dépôt vérifié"

  # L'ancienne archive locale devient inutile — elle libère 2.7 Go
  for old_archive in "$BACKUP_DIR"/photos-*.tar.gz; do
    [ -e "$old_archive" ] || continue
    rm -f "$old_archive"
    log "Archive photos locale supprimée (copie hors serveur en place) : $(basename "$old_archive")"
  done
}

mkdir -p "$BACKUP_DIR"

case "${1:-}" in
  db)     CURRENT_STEP="base de données"; backup_db ;;
  photos) CURRENT_STEP="photos"; backup_photos ;;
  *)
    echo "Usage : $0 {db|photos}" >&2
    exit 2
    ;;
esac
