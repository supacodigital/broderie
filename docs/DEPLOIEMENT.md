# Déploiement — Au Point-Compté

Guide unique de mise en ligne sur le VPS Infomaniak.
Suivre les étapes **dans l'ordre** : chacune dépend de la précédente.

- **VPS** : `179.237.87.29` — Ubuntu 26.04, 4 CPU / 12 Go / 250 Go, Plan-les-Ouates 🇨🇭
- **Domaine** : `broderie.ch` (Infomaniak)
- **Architecture** : Nginx (HTTPS) → Node/PM2 sur `localhost:3000`, qui sert l'API,
  la boutique, le back-office `/admin` et les images `/uploads`. MySQL en local.

---

## ⛔ Étape 0 — Débloquer l'accès SSH

**Rien ne peut être déployé tant que ce point n'est pas réglé.**

La connexion se fait **par clé SSH**, utilisateur `ubuntu` (jamais `root`, jamais par
mot de passe) :

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@179.237.87.29
```

Si la connexion est refusée (`Permission denied (publickey)`), c'est que la clé
publique n'est pas sur le serveur. Attention : le **Trousseau de clés** du dashboard
Infomaniak ne sert qu'à la *création* ou la *réinstallation* d'un serveur — il
n'injecte rien sur un VPS existant (Infomaniak l'indique lui-même : « Il ne permet
pas d'accéder au serveur »).

Trois pistes, par ordre de préférence :

1. **Mot de passe root d'origine** — cherché dans l'email Infomaniak de création du
   VPS ou un gestionnaire de mots de passe. Se connecter une fois, puis :
   ```bash
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo "<contenu de votre id_ed25519.pub>" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
2. **Console VNC** du dashboard Infomaniak (Actions rapides), si un identifiant
   système est retrouvé — même manipulation une fois connecté.
3. **Support Infomaniak** — demander une réinitialisation d'accès **sans
   réinstallation** (une réinstallation effacerait le contenu du VPS).

---

## Étape 1 — Installer la stack

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@179.237.87.29
sudo apt update && sudo apt upgrade -y

# Node 22 LTS (respecte le .nvmrc du projet)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22 && nvm alias default 22

npm install -g pm2
sudo apt install -y mysql-server nginx certbot python3-certbot-nginx git
sudo mysql_secure_installation
```

Vérifier : `node -v` (v22.x), `mysql --version`, `nginx -v`.

---

## Étape 2 — Créer la base de données

```bash
sudo mysql
```
```sql
CREATE DATABASE broderie CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'broderie_app'@'localhost' IDENTIFIED BY '<MOT_DE_PASSE_FORT>';
GRANT SELECT, INSERT, UPDATE, DELETE ON broderie.* TO 'broderie_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Notez ce mot de passe** : il ira dans `DB_PASSWORD` à l'étape 4.
> L'utilisateur n'a délibérément ni `DROP` ni `ALTER` — le schéma se charge en root.
> MySQL écoute sur `localhost` uniquement, le port 3306 n'est jamais exposé.

---

## Étape 3 — Récupérer le code et construire

```bash
cd ~
git clone https://github.com/supacodigital/broderie.git
cd broderie

cd backend  && npm ci --omit=dev && cd ..
cd frontend && npm ci && npm run build && cd ..
cd admin    && npm ci && npm run build && cd ..
```

`npm run build` produit `frontend/dist` et `admin/dist`, que l'API sert directement.

---

## Étape 4 — Configuration

`backend/.env.production` n'est pas dans Git (il contient les secrets). Il est déjà
prêt sur votre machine : le copier sur le serveur.

```bash
# depuis votre Mac, à la racine du projet
scp -i ~/.ssh/id_ed25519 backend/.env.production \
    ubuntu@179.237.87.29:~/broderie/backend/
```

Puis compléter les **deux seuls placeholders** restants, sur le serveur :

```bash
nano ~/broderie/backend/.env.production
#   DB_PASSWORD=<celui défini à l'étape 2>
#   MAIL_PASSWORD=<mot de passe de contact@broderie.ch>

chmod 600 ~/broderie/backend/.env.production
```

Tout le reste est déjà renseigné et vérifié : URLs `https://broderie.ch`, secrets
JWT/MFA (distincts de ceux de développement), IBAN réel de Julie, adresse et horaires
de la boutique, clés API Swiss Post, `contact@broderie.ch` en expéditeur.

**Contrôle avant d'aller plus loin** — si la config est invalide, l'API refusera de
démarrer :
```bash
cd ~/broderie/backend
NODE_ENV=production node -e "require('dotenv').config({path:'.env.production'}); require('./config/env'); console.log('✅ config valide')"
```

En cas d'erreur, le message nomme précisément la variable en cause.

---

## Étape 5 — Charger le schéma

```bash
cd ~/broderie/database
sudo mysql broderie < broderie.sql
```

C'est tout. `broderie.sql` est la **source unique** du schéma : les migrations
antérieures au déploiement y sont déjà intégrées (elles sont archivées dans
`database/migrations/archive/`). Aucun `--baseline` à lancer.

Contrôle facultatif :
```bash
cd ~/broderie/backend && npm run db:migrate:status    # → 0 en attente
```

---

## Étape 6 — Importer le catalogue

Copier les trois fichiers Excel de Julie dans `~/broderie/donnees-client/`
(`V_ArticleC_INT.xlsx`, `Gamme.xlsx`, `CRFournisseur.xlsx`), puis :

```bash
cd ~/broderie/backend
NODE_ENV=production npm run import:catalog -- --dry-run   # ⚠️ LIRE le rapport
NODE_ENV=production npm run import:catalog                # ~15 500 produits
```

Le `--dry-run` n'écrit rien : il indique combien d'articles seront retenus, lesquels
sont exclus et pourquoi. **Le relire avant de lancer l'import réel.**

Puis, sur MySQL :
```sql
ANALYZE TABLE products; ANALYZE TABLE product_translations;
```

> L'import est **rejouable sans risque** : la clé `external_ref` met à jour les
> articles connus au lieu de les dupliquer, et préserve ce que Julie a complété
> à la main (poids, descriptions, images, produits en vedette).

---

## Étape 7 — Démarrer l'API

```bash
cd ~/broderie
mkdir -p backend/logs
pm2 start ecosystem.config.js --env production
pm2 startup        # affiche une commande sudo à copier-coller
pm2 save           # redémarrage automatique au reboot
pm2 logs broderie-api --lines 30
```

> **PM2 est en mode fork (1 process), volontairement.** Ne pas repasser en cluster :
> le rate limiting et le cache produit sont en mémoire de process. Avec 4 workers, la
> protection anti-brute-force passerait de 5 à 20 tentatives, et une modification
> produit dans l'admin apparaîtrait puis disparaîtrait selon le worker qui répond.
> Détail dans les commentaires de `ecosystem.config.js`.

Test local : `curl http://localhost:3000/health` → `{"success":true,...}`

---

## Étape 8 — Nginx et HTTPS

```bash
sudo cp ~/broderie/deploy/nginx/broderie.conf /etc/nginx/sites-available/broderie
sudo ln -sf /etc/nginx/sites-available/broderie /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Le certificat s'obtient **après** la bascule DNS (étape 9), Let's Encrypt devant
pouvoir résoudre le domaine :
```bash
sudo certbot --nginx -d broderie.ch -d www.broderie.ch
```

---

## Étape 9 — Basculer le DNS

Dashboard Infomaniak → `broderie.ch` → **Zone DNS** :

| Enregistrement | Type | Valeur |
|---|---|---|
| `broderie.ch` | A | `179.237.87.29` |
| `www.broderie.ch` | A | `179.237.87.29` |

> ⚠️ Les enregistrements pointent aujourd'hui vers **`185.125.27.47`**, qui ne
> correspond à aucun service identifié — c'est ce qu'il faut corriger.
>
> **Ne pas toucher aux enregistrements MX, SPF, DKIM et DMARC** : ils font
> fonctionner `contact@broderie.ch` et `julie@broderie.ch`. Y toucher casserait
> l'envoi des factures.

La propagation prend de quelques minutes à quelques heures. Vérifier avec
`dig broderie.ch +short`, puis lancer certbot (étape 8).

---

## Étape 10 — Créer les deux comptes admin

Aucun compte n'existe sur une base neuve. Il en faut **deux, distincts** :

| Compte | Pour | Pourquoi séparé |
|---|---|---|
| `julie@broderie.ch` | Julie (gestion de la boutique) | Elle est à distance : elle doit pouvoir configurer sa MFA sur **son** téléphone |
| `supaco.digital@gmail.com` | Vous (maintenance technique) | Intervenir sans dépendre du téléphone de Julie, ni consommer ses codes de récupération |

Chaque compte a sa propre MFA, sur son propre téléphone. **Ne jamais partager un
compte admin** : le second facteur serait inutilisable par l'autre personne.

### Générer les hashs

```bash
cd ~/broderie/backend
node -e "require('bcrypt').hash('<MOT_DE_PASSE_JULIE>', 12).then(console.log)"
node -e "require('bcrypt').hash('<MOT_DE_PASSE_KEVIN>', 12).then(console.log)"
```

> **Au moins 12 caractères**, avec une majuscule et un symbole — règle renforcée
> côté serveur pour les comptes `admin` (les comptes clients restent à 5).

### Insérer les deux comptes

```bash
sudo mysql broderie
```
```sql
INSERT INTO users (email, password_hash, first_name, last_name, role, locale, is_active, email_verified_at)
VALUES
  ('julie@broderie.ch',        '<hash Julie>', 'Julie', 'Guerle', 'admin', 'fr', 1, NOW()),
  ('supaco.digital@gmail.com', '<hash Kevin>', 'Kevin', 'Khek',   'admin', 'fr', 1, NOW());

SELECT id, email, role FROM users WHERE role = 'admin';   -- doit afficher 2 lignes
```

`email_verified_at` est renseigné d'emblée : ça évite d'avoir à passer par le mail
de confirmation pour des comptes créés à la main.

### Premier login — MFA obligatoire pour les deux

La double authentification est **imposée à tout compte admin**. Chacun, de son côté,
sur `https://broderie.ch/admin` :

1. Saisir email et mot de passe.
2. Un écran de configuration affiche un **QR code**.
3. Le scanner avec une application d'authentification (Google Authenticator, Authy,
   1Password…). Une saisie manuelle est proposée si le scan échoue.
4. Confirmer avec le code à 6 chiffres affiché par l'application.
5. **10 codes de récupération s'affichent une seule fois** — à conserver dans un
   endroit sûr (gestionnaire de mots de passe). Ils permettent de se reconnecter en
   cas de perte du téléphone et ne sont **plus jamais récupérables** ensuite.

### Si quelqu'un perd son téléphone

- *Avec un code de récupération* : « Utiliser un code de récupération » sur l'écran
  MFA, puis régénérer un jeu depuis **Paramètres → Sécurité**.
- *Sans aucun code* : intervention en base, sur le compte concerné uniquement —
  ```bash
  sudo mysql broderie -e "DELETE FROM user_mfa WHERE user_id = <id>;"
  ```
  (`ON DELETE CASCADE` nettoie aussi ses codes de récupération.) La personne
  reconfigure sa MFA de zéro à la connexion suivante.

  C'est précisément l'intérêt des deux comptes : si Julie est bloquée, vous gardez
  un accès pour la débloquer — et réciproquement.

---

## Vérifications avant d'annoncer l'ouverture

- [ ] `https://broderie.ch` répond, cadenas HTTPS valide
- [ ] Catalogue : produits visibles, recherche et filtres fonctionnels
- [ ] Fiche produit : prix TTC, mention TVA, stock
- [ ] Commande de test complète → **facture QR reçue par email**
- [ ] Le QR de la facture est scannable par une application bancaire
- [ ] `https://broderie.ch/admin` : **les deux comptes admin** se connectent et
      configurent chacun leur MFA sur leur propre téléphone
- [ ] Admin : la commande de test apparaît, « Marquer comme payée » fonctionne
- [ ] **Annuler une commande de test → vérifier que le stock remonte**
- [ ] Parcours complet testé **sur mobile** (60 %+ du trafic suisse attendu)
- [ ] Sauvegarde MySQL automatique configurée sur le VPS

---

## Connu et assumé au lancement

| Sujet | État |
|---|---|
| **Photos produits** | Absentes. Julie remplit `Catalogue-a-completer-photos.xlsx`, puis `node database/import-catalog-photos.js` |
| **Carte / Twint** | Désactivés (phase 2). Facture QR et retrait uniquement. Clés Stripe vides → aucun paiement Stripe possible par accident |
| **Étiquettes Swiss Post** | API réelle active, mais **jamais testée en génération réelle** : la première étiquette de Julie sera le test grandeur nature (coût non confirmé) |
| **Suivi de livraison** | Pas d'API de tracking disponible pour ce compte → statut « Livrée » à passer manuellement. Un lien vers le suivi post.ch est fourni dans l'admin |
| **Relance des impayés** | Manuelle — aucune relance automatique des factures à 30 jours |

---

## Mettre à jour le site après un changement de code

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@179.237.87.29
cd ~/broderie && git pull

cd backend  && npm ci --omit=dev && cd ..
cd frontend && npm ci && npm run build && cd ..
cd admin    && npm ci && npm run build && cd ..

pm2 reload broderie-api      # rechargement sans coupure
pm2 logs broderie-api --lines 20
```

Si le schéma a changé, appliquer d'abord les nouvelles migrations :
```bash
cd ~/broderie/backend && npm run db:migrate
```

---

## En cas de problème

| Symptôme | Piste |
|---|---|
| L'API ne démarre pas | `pm2 logs broderie-api` — souvent une variable manquante dans `.env.production` (le message la nomme) |
| 502 Bad Gateway | L'API est tombée : `pm2 status`, puis `pm2 restart broderie-api` |
| Upload d'image en erreur 500 | Binaire `sharp` incompatible Linux : `cd ~/broderie/backend && npm rebuild sharp && pm2 reload broderie-api`. Sinon permissions : `mkdir -p uploads/products && chown -R $USER uploads` |
| Emails non reçus | `pm2 logs` (les échecs SMTP y sont tracés), vérifier `MAIL_PASSWORD`, puis les spams |
| Connexion admin en boucle | MFA non configuré ou cookie `Secure` bloqué — vérifier que le site est bien en HTTPS |
| « Trop de requêtes » (429) | Rate limiting : 10 tentatives de connexion / 15 min, 5 pour un code MFA. Attendre ou redémarrer l'API |

---

*Supaco Digital — Au Point-Compté 🇨🇭*
