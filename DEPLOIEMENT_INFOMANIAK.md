# Déploiement Infomaniak — Au Point-Compté

Guide pas-à-pas pour déployer le site sur le **VPS Cloud Infomaniak** (Ubuntu 26.04).
Architecture retenue : **mono-domaine + Nginx** en reverse-proxy devant Node.

> **Stratégie de mise en ligne — déploiement par IP, bascule différée**
> Le site tourne **actuellement sur un autre VPS** branché sur le domaine `broderie.ch`.
> On déploie **toute la prod** sur le VPS Infomaniak en y accédant par son **IP : `179.237.87.29`**,
> **sans toucher au DNS du domaine**. L'ancien VPS reste en ligne et sert le public pendant ce temps.
> Quand tout est validé sur l'IP, on bascule le domaine vers Infomaniak (voir **§10 — Bascule du domaine**).
>
> ⚠️ Ce déploiement est la **vraie prod** (`NODE_ENV=production`) : les cookies de session
> (refresh token, panier) sont posés en `Secure`. Un navigateur **refuse les cookies Secure en HTTP**.
> → On met donc **HTTPS dès maintenant sur l'IP** via un **certificat auto-signé** (§7), puis on le
> remplace par Let's Encrypt au moment de la bascule du domaine. Login admin et panier fonctionnent ainsi
> immédiatement (un avertissement navigateur s'affiche sur l'IP — normal, on l'accepte le temps de la recette).

```
                  ┌─────────────────── VPS Infomaniak (Ubuntu) ───────────────────┐
179.237.87.29 →   │  Nginx (:443 SSL)  ──reverse-proxy──►  Node/PM2 (:3000)        │
   (puis          │                                          ├── /            → frontend/dist
   broderie.ch)   │                                          ├── /admin       → admin/dist
                  │                                          ├── /api/v1/*    → API Express
                  │                                          └── /uploads     → images produit
                  │  MySQL (:3306, localhost)                                       │
                  └────────────────────────────────────────────────────────────────┘
```
> L'app Express sert **déjà** le frontend, l'admin et l'API (voir `backend/app.js`).
> Nginx ne fait donc que : TLS + reverse-proxy vers `localhost:3000` + cache des assets.

---

## 0. Prérequis (une seule fois)

- Accès **SSH** au VPS Infomaniak (clé SSH configurée dans le panel)
- **L'IP du VPS : `179.237.87.29`** — on déploie dessus directement, **aucun DNS à modifier maintenant**
- Ces valeurs prêtes : voir checklist en bas

```bash
ssh debian@179.237.87.29     # ou l'utilisateur fourni par Infomaniak
sudo apt update && sudo apt upgrade -y
```

---

## 1. Installer la stack

```bash
# Node 22 LTS (via nvm — respecte le .nvmrc du projet)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22 && nvm alias default 22

# PM2 (gestionnaire de process)
npm install -g pm2

# MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Nginx + Certbot (Certbot servira plus tard, à la bascule du domaine)
sudo apt install -y nginx certbot python3-certbot-nginx git
```

---

## 2. Base de données

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

Importer le schéma **puis les migrations dans l'ordre** :
```bash
cd ~/broderie/database
sudo mysql broderie < schema.sql
for f in migrations/0*.sql; do echo "→ $f"; sudo mysql broderie < "$f"; done
# (optionnel) données de démo : sudo mysql broderie < seeds.sql
```

> ℹ️ **Reprise des données de l'ancien VPS : pas maintenant.** On démarre sur une base neuve
> (schéma + migrations, éventuellement `seeds.sql` pour tester). La reprise des données réelles
> (produits, clients, commandes) et la migration des 1800 clients se feront **plus tard**, dans un
> second temps — à planifier avant ou pendant la bascule du domaine (§10).

---

## 3. Récupérer le code

```bash
cd ~
git clone https://github.com/supacodigital/broderie.git
cd broderie
```

---

## 4. Variables d'environnement

> Pour le déploiement par IP, on renseigne **l'IP en HTTPS** partout où le domaine apparaîtrait.
> Ces valeurs seront repassées sur `https://broderie.ch` à la bascule (§10).

```bash
# Backend
cp backend/.env.production.example backend/.env.production
nano backend/.env.production      # compléter tous les __A_DEFINIR__ / __GENERER__
```
Dans `backend/.env.production`, pour la phase IP :
```ini
NODE_ENV=production
CLIENT_URL=https://179.237.87.29
ADMIN_URL=https://179.237.87.29
# (les cookies Secure/CORS s'appuient sur ces deux URLs — voir backend/app.js)
```

```bash
# Frontend
cp frontend/.env.production.example frontend/.env.production
nano frontend/.env.production
```
```ini
VITE_API_URL=https://179.237.87.29/api/v1
VITE_STRIPE_PUBLIC_KEY=pk_live_...        # ou pk_test_ tant qu'on n'encaisse pas
VITE_GOOGLE_CLIENT_ID=...
```

```bash
# Admin
cp admin/.env.production.example admin/.env.production
nano admin/.env.production
```
```ini
VITE_API_URL=https://179.237.87.29/api/v1
VITE_SHOP_URL=https://179.237.87.29       # lien « Voir la boutique »
```

Générer les secrets JWT : `openssl rand -base64 64` (deux fois).

> ⚠️ Ne jamais committer ces fichiers (déjà dans `.gitignore`).
> ⚠️ **Google OAuth** : ajouter `https://179.237.87.29` aux *Authorized JavaScript origins*
> dans la console Google Cloud, sinon le bouton « Se connecter avec Google » échoue sur l'IP.

---

## 5. Installer les dépendances + builder

```bash
cd ~/broderie

# Backend (prod uniquement, sans devDeps)
cd backend && npm ci --omit=dev && cd ..

# Frontend
cd frontend && npm ci && npm run build && cd ..

# Admin
cd admin && npm ci && npm run build && cd ..
```
Les builds produisent `frontend/dist/` et `admin/dist/`, servis par Express.

> 🔁 Les `VITE_*` sont **inlinées au build**. Tout changement d'URL (ex. bascule vers le domaine)
> impose de **rebuilder** frontend + admin (voir §10).

---

## 6. Démarrer l'API avec PM2

```bash
cd ~/broderie
mkdir -p backend/logs
pm2 start ecosystem.config.js --env production
pm2 logs broderie-api          # vérifier "API opérationnelle" + connexion MySQL OK
pm2 save                       # sauvegarde la liste des process
pm2 startup                    # afficher la commande à coller pour le démarrage auto au reboot
```
Test local : `curl http://localhost:3000/health` → `{"success":true,...}`

---

## 7. Nginx + SSL (certificat auto-signé sur l'IP)

Sur une IP nue, Let's Encrypt **ne peut pas** émettre de certificat. On crée un **certificat auto-signé**
pour avoir du HTTPS (donc des cookies Secure fonctionnels) dès la phase de recette.

### 7a. Générer le certificat auto-signé
```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/selfsigned.key \
  -out    /etc/nginx/ssl/selfsigned.crt \
  -subj "/C=CH/ST=Geneve/L=Geneve/O=Au Point-Compte/CN=179.237.87.29"
```

### 7b. Configurer Nginx
Créer `/etc/nginx/sites-available/broderie` :
```nginx
# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name 179.237.87.29;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name 179.237.87.29;

    ssl_certificate     /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    # Corps des requêtes (upload images jusqu'à 5 Mo + marge)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/broderie /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> ✅ `app.js` active `app.set('trust proxy', 1)` en production — `X-Forwarded-Proto: https` est lu,
> donc les cookies httpOnly/**Secure** (refresh token, session panier) sont bien posés derrière Nginx.
> ⚠️ Le navigateur affichera **« Connexion non privée »** sur `https://179.237.87.29` (cert auto-signé) :
> c'est **normal**, on clique « Continuer ». Cet avertissement disparaîtra à la bascule (vrai cert Let's Encrypt).

---

## 8. Stripe production

> Tant qu'on est sur l'IP en recette, garder Stripe en **mode test** (clés `pk_test_`/`sk_test_`)
> pour ne rien encaisser. Le passage en `live` se fait à la bascule (§10).

- Dashboard Stripe → créer le **webhook** pointant sur l'IP :
  `https://179.237.87.29/api/v1/payments/webhook` → copier le `whsec_...` dans `backend/.env.production`
  *(Stripe accepte une URL en IP/HTTPS auto-signé pour le mode test.)*
- Activer **Twint** dans le dashboard (nécessite le compte bancaire suisse de Julie) — pour le mode live.
- Tester un paiement carte (mode test) + le flux Twint QR.

---

## 9. Vérifications finales (sur l'IP)

```bash
curl -k https://179.237.87.29/health      # -k : ignore le cert auto-signé
```
- [ ] Site accessible sur `https://179.237.87.29`, redirection 80→443 OK
- [ ] `/admin` charge le back-office et le **login admin fonctionne** (cookie Secure posé)
- [ ] Ajout au **panier** persistant (cookie session posé)
- [ ] Tunnel d'achat complet (desktop + mobile)
- [ ] Paiement carte + Twint en **mode test** + facture QR (IBAN réel affiché)
- [ ] Emails transactionnels reçus (SMTP)
- [ ] Images produit chargées sous `/uploads`
- [ ] Backup automatique configuré (brancher `mysqldump`)

---

## 10. 🔀 Bascule du nom de domaine (broderie.ch → VPS Infomaniak)

À faire **uniquement quand la recette sur l'IP est 100 % validée**. Objectif : zéro coupure, zéro perte de données.

### Étape A — Préparer Infomaniak à répondre sur le domaine *(avant tout changement DNS)*

1. **Baisser le TTL du DNS** sur l'ancien hébergeur **24–48 h avant** la bascule
   (ex. passer le TTL de l'enregistrement A de 3600 s à **300 s**) → propagation rapide le jour J.
2. **Mettre à jour les `.env`** pour le domaine, puis **rebuilder** front + admin :
   ```bash
   cd ~/broderie
   # backend/.env.production
   #   NODE_ENV=production
   #   CLIENT_URL=https://broderie.ch
   #   ADMIN_URL=https://broderie.ch
   # frontend/.env.production  → VITE_API_URL=https://broderie.ch/api/v1
   # admin/.env.production     → VITE_API_URL=https://broderie.ch/api/v1 , VITE_SHOP_URL=https://broderie.ch
   cd frontend && npm run build && cd ..
   cd admin && npm run build && cd ..
   pm2 reload broderie-api
   ```
3. **Ajouter le domaine dans Nginx** (`server_name broderie.ch www.broderie.ch;`) en gardant
   provisoirement l'IP. `sudo nginx -t && sudo systemctl reload nginx`.

### Étape B — Reprise des données (à planifier, pas encore tranché)

> ⚠️ **Décision en attente.** La reprise des données réelles n'est pas faite au moment du déploiement IP.
> Avant d'ouvrir le domaine au public, décider et exécuter :
4. **Reprise BDD** : `mysqldump` de l'ancienne base → import sur Infomaniak (produits, commandes…),
   **et/ou** migration des 1800 clients (voir claude_task.md §7). À tester sur staging d'abord.
5. **Copier les `uploads/`** (images produit) de l'ancien VPS vers `backend/uploads/products/`.
   *(Si on décide de repartir sur une base neuve sans reprise, sauter cette étape.)*

### Étape C — Repointer le DNS

6. Sur l'hébergeur du domaine, modifier l'enregistrement **A** :
   `broderie.ch` (et `www`) → **`179.237.87.29`**.
   Supprimer tout ancien A/AAAA pointant vers l'ancien VPS.
7. Attendre la propagation (rapide grâce au TTL bas). Vérifier :
   ```bash
   dig +short broderie.ch       # doit renvoyer 179.237.87.29
   ```

### Étape D — Vrai certificat SSL Let's Encrypt

8. Une fois le DNS propagé (Certbot valide le domaine via HTTP-01) :
   ```bash
   sudo certbot --nginx -d broderie.ch -d www.broderie.ch
   ```
   Certbot remplace le cert auto-signé, configure le renouvellement auto et la redirection 80→443.
   → L'avertissement « connexion non privée » disparaît.

### Étape E — Passer les services externes en production

9. **Stripe** → recréer le webhook sur `https://broderie.ch/api/v1/payments/webhook`, passer en clés
   **live** (`pk_live_`/`sk_live_`), rebuilder le front si la clé publique change, mettre `whsec_` live.
10. **Google OAuth** → ajouter `https://broderie.ch` aux *Authorized JavaScript origins*.
11. **Swiss Post** → vérifier les clés API live le cas échéant.

### Étape F — Vérifs post-bascule

```bash
curl https://broderie.ch/health
```
- [ ] `https://broderie.ch` répond avec cert Let's Encrypt valide (cadenas vert)
- [ ] Redirection `www` → apex (ou inverse) cohérente
- [ ] Login admin + panier OK sur le domaine
- [ ] Paiement réel (petit montant) carte + Twint **en live**
- [ ] Emails transactionnels reçus avec liens en `broderie.ch`
- [ ] Webhook Stripe live reçoit bien les events (dashboard Stripe)

### Étape G — Filet de sécurité

12. **Ne pas éteindre l'ancien VPS tout de suite** : le garder ~1 semaine en secours (rollback DNS rapide
    possible vers l'ancienne IP si problème).
13. Remonter le **TTL DNS** à une valeur normale (3600 s) une fois la bascule stable.

---

## Points en suspens (à trancher / fournir)

| Sujet | Détail |
|---|---|
| **Stockage médias** | ✅ Tranché : **disque du VPS** (`backend/uploads/products/`, servi sous `/uploads`). `config/storage.js` écrit sur disque (plus de dépendance S3). ⚠️ Vérifier la taille du disque pour ~14 000 produits × 3 WebP, **inclure `uploads/` dans Swiss Backup**, et ne pas l'effacer lors des `git pull`/déploiements. |
| **Swiss Post API** | Clés `CLIENT_ID/SECRET` après approbation (étiquettes en mock d'ici là). |
| **Migration 1800 clients** | À tester sur staging avant la prod (voir claude_task.md §7). |
| **Backup BDD** | Cron `mysqldump` quotidien vers Swiss Backup. |

---

## Mises à jour ultérieures (après un nouveau push sur main)

```bash
cd ~/broderie && git pull origin main
cd backend && npm ci --omit=dev && cd ..
cd frontend && npm ci && npm run build && cd ..
cd admin && npm ci && npm run build && cd ..
# rejouer les nouvelles migrations si besoin (database/migrations/)
pm2 reload broderie-api        # redémarrage zéro-downtime
```

---

*Supaco Digital — Au Point-Compté — 2026*
