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
# Usage :
#   backup-broderie.sh db      # dump SQL quotidien
#   backup-broderie.sh photos  # archive mensuelle des photos
#
# Installation : voir deploy/README-backup.md
# ============================================================

set -euo pipefail

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

# Garde-fou : ne jamais lancer une sauvegarde qui remplirait le disque.
# Un disque plein arrête MySQL et met la boutique hors ligne — le remède
# serait pire que le mal.
MIN_FREE_MB=2048

timestamp() { date +%Y%m%d-%H%M%S; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

free_mb() { df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}'; }

check_space() {
  local free
  free=$(free_mb)
  if [ "$free" -lt "$MIN_FREE_MB" ]; then
    log "ERREUR : seulement ${free} Mo libres (minimum ${MIN_FREE_MB} Mo). Sauvegarde annulée."
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
    exit 1
  fi

  # Une archive vide ou minuscule signale un dump raté que le code retour
  # n'a pas signalé (pipe : c'est gzip qui renvoie 0, pas mysqldump).
  local size
  size=$(stat -c%s "$out")
  if [ "$size" -lt 100000 ]; then
    log "ERREUR : archive suspecte (${size} octets) — dump probablement incomplet"
    rm -f "$out"
    exit 1
  fi

  log "Base sauvegardée : $(basename "$out") ($(du -h "$out" | cut -f1))"

  # Rotation : ne garder que les KEEP_DB plus récentes
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_DB + 1)) | while read -r old; do
    rm -f "$old"
    log "Purge : $(basename "$old")"
  done
}

backup_photos() {
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
    exit 1
  fi

  log "Photos sauvegardées : $(basename "$out") ($(du -h "$out" | cut -f1))"
}

mkdir -p "$BACKUP_DIR"

case "${1:-}" in
  db)     backup_db ;;
  photos) backup_photos ;;
  *)
    echo "Usage : $0 {db|photos}" >&2
    exit 2
    ;;
esac
