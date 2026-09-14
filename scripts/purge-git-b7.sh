#!/usr/bin/env bash
#
# B7 — Purge de l'historique git : supprime backend/.env, frontend/.env et
# e2e/.env.test de TOUS les commits, sur toutes les branches.
#
#   ⚠️  OPÉRATION DESTRUCTIVE — réécrit l'historique et impose un `git push --force`.
#   ⚠️  À exécuter APRÈS avoir mergé la PR d'audit et prévenu l'équipe.
#   ⚠️  ROTATION DES SECRETS À FAIRE AVANT — purger l'historique ne suffit pas :
#       tout secret ayant été poussé doit être considéré comme compromis (clones,
#       forks, caches GitHub). Avant de lancer ce script :
#         1. Stripe    → dashboard, révoquer et régénérer les clés (test ET live)
#         2. SMTP      → changer le mot de passe de la boîte d'envoi
#         3. JWT / MFA → régénérer les secrets (openssl rand -base64 64) et
#                        MFA_ENCRYPTION_KEY (openssl rand -hex 32)
#         4. Swiss Post→ « Renew client secret » sur developer.post.ch
#         5. Reporter les nouvelles valeurs dans backend/.env.production (VPS)
#
# Usage :
#   1. git-filter-repo doit être installé : brew install git-filter-repo
#   2. Depuis la racine du repo, sur une copie propre (working tree clean) :
#        bash scripts/purge-git-b7.sh [chemin/vers/replacements.txt]
#      L'argument optionnel est un fichier au format `git filter-repo --replace-text`
#      (une règle par ligne : `valeur==>REMPLACEMENT`). Il sert à effacer des
#      fragments de secrets qui traîneraient AILLEURS que dans les .env supprimés
#      (ex. cités dans un ancien commit de doc). Ce fichier NE DOIT PAS être versionné.
#   3. Le script s'arrête AVANT le push forcé : relire, puis pousser à la main
#      (les commandes exactes sont affichées à la fin).
#
set -euo pipefail

REPLACE_TEXT_FILE="${1:-}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YEL=$'\033[33m'; NC=$'\033[0m'
step() { echo; echo "${BOLD}▶ $*${NC}"; }
die()  { echo "${RED}✗ $*${NC}" >&2; exit 1; }

# ── Pré-vérifications ────────────────────────────────────────────────────────
step "Vérifications préalables"

command -v git-filter-repo >/dev/null 2>&1 \
  || die "git-filter-repo introuvable — installer avec : brew install git-filter-repo"

[ -z "$(git status --porcelain)" ] \
  || die "Working tree non propre — commiter ou stasher d'abord."

CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = "main" ] \
  || echo "${YEL}⚠  Vous n'êtes pas sur main (branche : $CURRENT_BRANCH). Continuer ? [y/N]${NC}" && {
    [ "$CURRENT_BRANCH" = "main" ] || { read -r ans; [ "$ans" = "y" ] || die "Annulé."; }
  }

REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
[ -n "$REMOTE_URL" ] || die "Pas de remote 'origin' configuré."
echo "  remote origin : $REMOTE_URL"

if [ -n "$REPLACE_TEXT_FILE" ]; then
  [ -f "$REPLACE_TEXT_FILE" ] || die "Fichier --replace-text introuvable : $REPLACE_TEXT_FILE"
  case "$REPLACE_TEXT_FILE" in
    "$REPO_ROOT"/*) die "Le fichier de remplacements est DANS le repo ($REPLACE_TEXT_FILE) — le déplacer dehors, il ne doit pas être versionné." ;;
  esac
  echo "  replace-text  : $REPLACE_TEXT_FILE ($(grep -c '==>' "$REPLACE_TEXT_FILE") règle(s))"
fi

# Vérifie que les secrets ont bien été roulés : la clé Stripe test de l'historique
# ne doit plus être active (on ne peut pas le tester ici — simple rappel).
echo
echo "${YEL}${BOLD}CHECKPOINT — avez-vous DÉJÀ :${NC}"
echo "  1. Roulé la clé secrète Stripe (mode test) dans le dashboard ?"
echo "  2. Régénéré le mot de passe SMTP Mailtrap ?"
echo "  3. Reporté les nouvelles valeurs dans backend/.env et backend/.env.production (VPS) ?"
echo "  4. Prévenu l'équipe qu'elle devra re-cloner ?"
echo -n "Répondre 'oui' pour continuer : "
read -r confirm
[ "$confirm" = "oui" ] || die "Rotation des secrets non confirmée — voir la liste en tête de ce script."

# ── Sauvegarde ──────────────────────────────────────────────────────────────
step "Sauvegarde du dossier avant purge"
BACKUP="../$(basename "$REPO_ROOT")-backup-avant-purge-$(date +%Y%m%d-%H%M%S)"
cp -R "$REPO_ROOT" "$BACKUP"
echo "  → $BACKUP"

# ── Fichiers présents dans l'historique ─────────────────────────────────────
step "Fichiers ciblés — présence dans l'historique"
for f in backend/.env frontend/.env e2e/.env.test; do
  n="$(git log --all --full-history --oneline -- "$f" | wc -l | tr -d ' ')"
  echo "  $f : $n commit(s)"
done

# Les vérifications post-purge portent sur les branches LOCALES réécrites, pas sur
# refs/remotes/origin/* (encore l'ancien état tant que le push --force n'a pas eu lieu).
LOCAL_BRANCHES=()
while IFS= read -r b; do LOCAL_BRANCHES+=("$b"); done < <(git for-each-ref --format='%(refname:short)' refs/heads)

# On capture les valeurs sensibles depuis le .env historique AVANT de le purger,
# pour pouvoir vérifier après coup qu'elles ont bien disparu. Ces variables ne
# sont jamais écrites sur disque et meurent avec le process.
INITIAL_ENV_COMMIT="$(git log --all --diff-filter=A --format=%H -- backend/.env | tail -1)"
SECRET_NEEDLES=()
if [ -n "$INITIAL_ENV_COMMIT" ]; then
  while IFS= read -r line; do
    case "$line" in
      STRIPE_SECRET_KEY=*|STRIPE_WEBHOOK_SECRET=*|MAIL_USER=*|MAIL_PASSWORD=*|JWT_ACCESS_SECRET=*|JWT_REFRESH_SECRET=*|SHIPENGINE_API_KEY=*|STORAGE_ACCESS_KEY=*|STORAGE_SECRET_KEY=*)
        val="${line#*=}"
        [ "${#val}" -ge 8 ] && SECRET_NEEDLES+=("$val")
        ;;
    esac
  done < <(git show "$INITIAL_ENV_COMMIT:backend/.env" 2>/dev/null || true)
  echo "  ${#SECRET_NEEDLES[@]} valeur(s) sensible(s) mémorisée(s) pour vérification post-purge"
fi

# ── Purge ───────────────────────────────────────────────────────────────────
step "git filter-repo — réécriture de l'historique"
FR_ARGS=(
  --path backend/.env
  --path frontend/.env
  --path e2e/.env.test
  --invert-paths
)
[ -n "$REPLACE_TEXT_FILE" ] && FR_ARGS+=(--replace-text "$REPLACE_TEXT_FILE")
git filter-repo "${FR_ARGS[@]}" --force

# filter-repo supprime le remote par sécurité — on le remet
git remote add origin "$REMOTE_URL"

# ── Vérifications post-purge ────────────────────────────────────────────────
step "Vérifications (branches locales : ${LOCAL_BRANCHES[*]})"
FAIL=0
for f in backend/.env frontend/.env e2e/.env.test; do
  if git log "${LOCAL_BRANCHES[@]}" --full-history --oneline -- "$f" | grep -q .; then
    echo "  ${RED}✗ $f encore présent dans l'historique${NC}"; FAIL=1
  else
    echo "  ${GREEN}✓ $f absent des branches locales${NC}"
  fi
done
# Aucune des valeurs sensibles mémorisées ne doit plus apparaître dans un diff
if [ "${#SECRET_NEEDLES[@]}" -gt 0 ]; then
  leaked=0
  for needle in "${SECRET_NEEDLES[@]}"; do
    if git log "${LOCAL_BRANCHES[@]}" -S "$needle" --oneline | grep -q .; then
      echo "  ${RED}✗ Une valeur sensible est encore trouvable dans l'historique${NC}"; leaked=1; FAIL=1
    fi
  done
  [ "$leaked" -eq 0 ] && echo "  ${GREEN}✓ Aucune valeur sensible du .env initial dans les diffs${NC}"
else
  echo "  ${YEL}⚠  Impossible de mémoriser les valeurs sensibles — vérifier à la main${NC}"
fi
[ "$FAIL" -eq 0 ] || die "Vérifications échouées — NE PAS pousser. Restaurer depuis $BACKUP."

# ── Push (manuel) ──────────────────────────────────────────────────────────
step "${GREEN}Purge locale OK.${NC} Push forcé à faire manuellement :"
cat <<EOF

  git push origin --force --all
  git push origin --force --tags

Si GitHub refuse (branche protégée) :
  Settings → Branches → désactiver temporairement la protection de main,
  pousser, puis réactiver.

Ensuite :
  - Recréer les PR ouvertes depuis les branches réécrites
  - Sur le VPS : l'historique ayant été réécrit, un `git pull` échouera.
      cd ~ && mv broderie broderie.old && git clone <url> broderie
      cp broderie.old/backend/.env.production broderie/backend/
      puis rebuild + pm2 reload (voir docs/DEPLOIEMENT.md § « Mettre à jour le site »)
  - Supprimer la sauvegarde une fois tout validé : rm -rf "$BACKUP"

EOF
