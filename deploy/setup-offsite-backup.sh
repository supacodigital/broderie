#!/bin/bash
# ============================================================
# Mise en place de la copie HORS SERVEUR des sauvegardes — ticket ADM-11
#
# « Où sont stockées les copies ? » Jusqu'ici, sur le même disque que le site :
# une panne ou une perte du serveur les emportait avec lui. Ce script branche la
# sauvegarde nocturne (backup-broderie.sh) sur l'espace Swiss Backup
# d'Infomaniak (appareil S3 « serveur-broderie ») : 3 copies dans leurs centres
# de données en Suisse, ailleurs que sur ce serveur.
#
# Les copies sont chiffrées sur le serveur, AVANT l'envoi, par restic, avec une
# clé que nous seuls détenons : même en cas d'accès au stockage, les données des
# clientes restent illisibles.
#
# À lancer une seule fois, sur le serveur, depuis un terminal (les accès sont
# demandés au clavier et ne s'affichent pas) :
#   sudo bash /var/www/broderie.ch/deploy/setup-offsite-backup.sh
#
# Il peut être relancé sans risque : ce qui est déjà en place est conservé.
# Étapes : installation de restic, accès Swiss Backup, clé de chiffrement,
# dépôt chiffré, premières copies (base puis photos), restauration test.
# ============================================================

set -Eeuo pipefail

CONF_DIR="/root/.config/broderie-backup"
ENV_FILE="$CONF_DIR/offsite.env"
KEY_FILE="$CONF_DIR/restic.key"
# Appareil S3 « serveur-broderie » — Manager Infomaniak → Swiss Backup
S3_ENDPOINT="https://s3.swiss-backup02.infomaniak.com"
S3_BUCKET="broderie-backup"
S3_REGION="us-east-1"
SITE_DIR="/var/www/broderie.ch"
BACKUP_SCRIPT="/usr/local/bin/backup-broderie.sh"
LOCAL_BACKUPS="/home/ubuntu/backups"

step() { echo; echo "── $* ──"; }
fail() { echo "❌ $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "À lancer avec sudo."

VERIFY_DIR="$(mktemp -d /tmp/verif-sauvegarde-XXXX)"
trap 'rm -rf "$VERIFY_DIR"' EXIT

step "1/6 — Installation de restic"
if ! command -v restic >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq restic
fi
restic version

step "2/6 — Accès Swiss Backup"
mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"
if [ -f "$ENV_FILE" ]; then
  echo "Accès déjà enregistrés ($ENV_FILE) : conservés."
else
  echo "Clés à générer dans le Manager : Swiss Backup → serveur-broderie →"
  echo "Informations de connexion → « Générer des nouvelles clés »."
  read -rp  "Access Key : " ACCESS_KEY
  read -rsp "Secret Key (rien ne s'affiche, c'est normal) : " SECRET_KEY
  echo
  read -rp  "Adresse e-mail qui reçoit les alertes en cas d'échec : " ALERT_TO
  [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ] && [ -n "$ALERT_TO" ] || fail "Champ vide : rien n'a été enregistré."
  case "$ACCESS_KEY$SECRET_KEY$ALERT_TO" in
    *"'"*) fail "Une valeur contient une apostrophe : rien n'a été enregistré." ;;
  esac
  # Lisible par root seulement : il contient la clé d'accès au stockage
  umask 077
  cat > "$ENV_FILE" <<EOF
AWS_ACCESS_KEY_ID='$ACCESS_KEY'
AWS_SECRET_ACCESS_KEY='$SECRET_KEY'
AWS_DEFAULT_REGION='$S3_REGION'
RESTIC_REPOSITORY='s3:$S3_ENDPOINT/$S3_BUCKET'
RESTIC_PASSWORD_FILE='$KEY_FILE'
BACKUP_ALERT_TO='$ALERT_TO'
EOF
  chmod 600 "$ENV_FILE"
  echo "Accès enregistrés (lisibles par root uniquement)."
fi

step "3/6 — Clé de chiffrement"
if [ -f "$KEY_FILE" ]; then
  echo "Clé existante conservée."
else
  umask 077
  openssl rand -base64 48 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "Clé créée. Sans elle, les copies sont illisibles — y compris pour nous."
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

step "4/6 — Dépôt chiffré chez Swiss Backup"
if restic cat config >/dev/null 2>&1; then
  echo "Dépôt déjà créé."
else
  restic init
fi

step "5/6 — Sauvegarde nocturne mise à jour, premières copies"
install -m 755 "$SITE_DIR/deploy/backup-broderie.sh" "$BACKUP_SCRIPT"
echo "Base de données et configuration…"
"$BACKUP_SCRIPT" db
echo "Photos (première copie complète, quelques minutes)…"
"$BACKUP_SCRIPT" photos
restic snapshots --compact

step "6/6 — Restauration test"
# Base : le dernier dump, récupéré depuis Swiss Backup, doit être identique à
# l'original et lisible jusqu'au bout.
dump="$(ls -1t "$LOCAL_BACKUPS"/db-*.sql.gz | head -1)"
restic restore latest --tag db --host broderie --target "$VERIFY_DIR" --include "$dump" >/dev/null
if cmp -s "$dump" "$VERIFY_DIR$dump" && gunzip -t "$VERIFY_DIR$dump"; then
  echo "✅ Base : $(basename "$dump") restaurée depuis Swiss Backup, identique et lisible."
else
  fail "Base : la copie restaurée ne correspond pas à l'original."
fi

# Configuration : le fichier de réglages de l'application
if restic restore latest --tag db --host broderie --target "$VERIFY_DIR" --include "$SITE_DIR/backend/.env" >/dev/null \
   && cmp -s "$SITE_DIR/backend/.env" "$VERIFY_DIR$SITE_DIR/backend/.env"; then
  echo "✅ Configuration du site : restaurée, identique."
else
  fail "Configuration : la copie restaurée ne correspond pas à l'original."
fi

# Photos : un fichier pris au hasard
photo="$(find "$SITE_DIR/backend/uploads" -type f | shuf -n 1)"
restic restore latest --tag photos --host broderie --target "$VERIFY_DIR" --include "$photo" >/dev/null
if cmp -s "$photo" "$VERIFY_DIR$photo"; then
  echo "✅ Photos : $(basename "$photo") restaurée depuis Swiss Backup, identique."
else
  fail "Photos : la copie restaurée ne correspond pas à l'original."
fi

echo
echo "Copie hors serveur en place. Espace utilisé chez Swiss Backup :"
restic stats --mode raw-data | grep -E "Total Size|Total Uncompressed Size" || true
echo
echo "⚠️  Garde une copie de la clé de chiffrement HORS du serveur (gestionnaire de"
echo "    mots de passe). Pour l'afficher, lance séparément :"
echo "      sudo cat $KEY_FILE"
echo "    Ne la colle nulle part ailleurs : sans elle les copies sont illisibles,"
echo "    et avec elle n'importe qui pourrait les lire."
