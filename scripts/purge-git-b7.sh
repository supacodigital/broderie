#!/usr/bin/env bash
#
# B7 — Purge de l'historique git : supprime backend/.env, frontend/.env et
# e2e/.env.test de TOUS les commits, sur toutes les branches.
#
#   ⚠️  OPÉRATION DESTRUCTIVE — réécrit l'historique et impose un `git push --force`.
#   ⚠️  À exécuter APRÈS avoir mergé la PR d'audit et prévenu l'équipe.
#   ⚠️  La rotation des secrets (Stripe test, Mailtrap) doit être faite AVANT — voir
#       docs/PURGE-GIT-B7.md, section « Étape 1 ».
#
# Usage :
#   1. git-filter-repo doit être installé : brew install git-filter-repo
#   2. Depuis la racine du repo, sur une copie propre (working tree clean) :
#        bash scripts/purge-git-b7.sh
#   3. Le script s'arrête AVANT le push forcé : relire, puis pousser à la main
#      (les commandes exactes sont affichées à la fin).
#
set -euo pipefail

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
[ "$confirm" = "oui" ] || die "Rotation des secrets non confirmée — voir docs/PURGE-GIT-B7.md."

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

# ── Purge ───────────────────────────────────────────────────────────────────
step "git filter-repo — réécriture de l'historique"
git filter-repo \
  --path backend/.env \
  --path frontend/.env \
  --path e2e/.env.test \
  --invert-paths --force

# filter-repo supprime le remote par sécurité — on le remet
git remote add origin "$REMOTE_URL"

# ── Vérifications post-purge ────────────────────────────────────────────────
step "Vérifications"
FAIL=0
for f in backend/.env frontend/.env e2e/.env.test; do
  if git log --all --full-history --oneline -- "$f" | grep -q .; then
    echo "  ${RED}✗ $f encore présent dans l'historique${NC}"; FAIL=1
  else
    echo "  ${GREEN}✓ $f absent de tout l'historique${NC}"
  fi
done
if git log --all -S "sk_test_51TUXLl" --oneline | grep -q .; then
  echo "  ${RED}✗ La clé Stripe test est encore trouvable dans un diff${NC}"; FAIL=1
else
  echo "  ${GREEN}✓ Clé Stripe test absente des diffs${NC}"
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
  - Sur le VPS : re-cloner + recopier les .env.production (voir docs/PURGE-GIT-B7.md §4)
  - Supprimer la sauvegarde une fois tout validé : rm -rf "$BACKUP"

EOF
