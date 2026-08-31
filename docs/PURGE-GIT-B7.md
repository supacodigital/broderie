# B7 — Purge de l'historique git + rotation des secrets

> **À exécuter par Kevin.** Opération destructive (réécriture d'historique + `push --force`
> sur les 3 branches). Prévenir toute l'équipe **avant** : chaque personne devra re-cloner.

---

## Ce qui fuit

Le commit initial `0e3e7626` (jamais réécrit) versionne `backend/.env` et `frontend/.env` :

| Secret | Valeur exposée | Criticité |
|--------|----------------|-----------|
| `STRIPE_SECRET_KEY` | `sk_test_51TUXLl…` (clé **test** réelle, 107 car.) | 🟠 permet des appels API sur le compte Stripe test |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | 🟡 |
| `MAIL_USER` / `MAIL_PASSWORD` | identifiants Mailtrap **sandbox** réels (`97c2facfe48c02` / `6fcbccd9e422fb`) | 🟡 boîte de test uniquement |
| `DB_PASSWORD` | `root` | 🟢 (local) |
| `VITE_STRIPE_PUBLIC_KEY` | `pk_test_51TUXLl…` | 🟢 (clé publique) |

`e2e/.env.test` était **tracké** (commit `741347e5`) avec `TEST_ADMIN_EMAIL=admin@broderie.ch` /
`TEST_ADMIN_PASSWORD=Test1234!`. → déjà retiré du tracking dans le commit B7 de cette branche
(`git rm --cached`), un `e2e/.env.test.example` neutralisé le remplace. Reste à le purger de l'historique.

Fichiers concernés dans l'historique : `backend/.env`, `frontend/.env`, `e2e/.env.test`
(commits `0e3e7626`, `6813157b`, `741347e5`).

Branches à réécrire : `main`, `feat/session-facturation-email-ux`, `feat/swisspost-api-seo`
(toutes présentes sur `origin`).

---

## Étape 1 — Rotation des secrets (À FAIRE EN PREMIER)

Une fois les secrets roulés, l'ancien commit devient inoffensif même s'il traîne quelque part.

### Stripe (mode test)
1. Dashboard Stripe → **Développeurs → Clés API**
2. « Clé secrète » (mode test) → **Actionner la rotation** → révoquer l'ancienne
3. Reporter la nouvelle `sk_test_…` dans :
   - `backend/.env` (local)
   - `backend/.env.production` (VPS — `ssh` puis éditer)
4. Le webhook : Dashboard → **Développeurs → Webhooks** → l'endpoint local/recette →
   « Révéler » le `whsec_…`, le remettre dans les deux `.env` si tu le régénères

### Mailtrap (boîte sandbox)
1. mailtrap.io → **Email Testing → Inboxes → [ta boîte] → SMTP Settings**
2. Régénérer le mot de passe SMTP
3. Reporter `MAIL_USER` / `MAIL_PASSWORD` dans `backend/.env` (le prod est sur Brevo/Infomaniak,
   pas concerné — cf. `docs/claude_task.md` §5)

### Google OAuth (par précaution)
Le `client_id` seul n'est pas secret, mais si un `GOOGLE_CLIENT_SECRET` a existé dans un `.env` :
1. console.cloud.google.com → **API et services → Identifiants → [OAuth 2.0 Client]**
2. « Réinitialiser le secret »
3. Reporter dans `backend/.env` et `backend/.env.production`

---

## Étape 2 — Réécriture de l'historique

### Installer git-filter-repo
```bash
brew install git-filter-repo
# ou : pipx install git-filter-repo
```

### Sauvegarde
```bash
cd ~/Desktop/"Au Point Compté"
cp -R broderie broderie-backup-avant-purge   # filet de sécurité local
```

### Purge
```bash
cd broderie
# S'assurer que tout est commité / poussé, working tree propre
git status

# Réécrit TOUTES les branches et tags : supprime ces 3 chemins de tout l'historique
git filter-repo \
  --path backend/.env \
  --path frontend/.env \
  --path e2e/.env.test \
  --invert-paths --force
```

`git filter-repo` **supprime le remote `origin`** (sécurité). Le remettre :
```bash
git remote add origin https://github.com/supacodigital/broderie.git
```

### Vérifier que c'est propre
```bash
git log --all --full-history --oneline -- backend/.env frontend/.env e2e/.env.test
# → doit ne rien afficher

git log --all -S "sk_test_51TUXLl" --oneline
# → doit ne rien afficher
```

---

## Étape 3 — Push forcé

> Toutes les branches d'un coup. Après ça, **tout clone existant est cassé** (historique divergent).

```bash
git push origin --force --all
git push origin --force --tags
```

Si GitHub refuse (branche protégée) : Settings → Branches → désactiver temporairement la
protection de `main`, pousser, réactiver.

---

## Étape 4 — Après le push

1. **Prévenir l'équipe** (message type) :
   > L'historique git de `broderie` a été réécrit (purge de secrets). Vos clones locaux sont
   > obsolètes. Supprimez votre dossier local et re-clonez :
   > `rm -rf broderie && git clone https://github.com/supacodigital/broderie.git`
   > Si vous avez du travail non poussé : `git stash` / faites un patch AVANT de supprimer.

2. **Fermer les PR ouvertes** puis les recréer depuis les branches réécrites (les PR pointant
   sur l'ancien historique afficheront des diffs incohérents).

3. Sur le **VPS** : le déploiement se fait par `git pull`. Là aussi il faut re-cloner :
   ```bash
   ssh <vps>
   cd ~ && mv broderie broderie-old
   git clone https://github.com/supacodigital/broderie.git
   cd broderie
   cp ../broderie-old/backend/.env.production backend/.env.production   # récupérer les .env non versionnés
   cp ../broderie-old/frontend/.env.production frontend/.env.production
   cp ../broderie-old/admin/.env.production admin/.env.production
   # puis npm ci + builds + pm2 reload (cf. DEPLOIEMENT.md §14)
   ```

4. Supprimer les sauvegardes une fois tout validé :
   `rm -rf ~/Desktop/"Au Point Compté"/broderie-backup-avant-purge` et `broderie-old` sur le VPS.

5. **GitHub garde des refs cachées** un moment (vues de PR, cache). Contacter le support GitHub
   pour purger le cache si un secret critique était en jeu — ici (clés **test** + Mailtrap sandbox,
   déjà roulées à l'étape 1) ce n'est pas nécessaire.

---

## Checklist

- [ ] Stripe : clé test roulée, reportée dans `.env` local + `.env.production`
- [ ] Mailtrap : mot de passe SMTP régénéré, reporté dans `.env` local
- [ ] Google OAuth secret réinitialisé (si applicable)
- [ ] `git filter-repo` exécuté, vérifications OK (aucun `.env` dans l'historique)
- [ ] `git push --force --all` + `--tags`
- [ ] Équipe prévenue, PR ouvertes recréées
- [ ] VPS re-cloné, `.env.production` récupérés, déploiement OK
- [ ] Sauvegardes locales + VPS supprimées
