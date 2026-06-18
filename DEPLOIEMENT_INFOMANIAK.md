# Déploiement Infomaniak — Au Point-Compté

Guide pas-à-pas pour déployer le site sur le **VPS Cloud Infomaniak** (Ubuntu 26.04).
Architecture retenue : **mono-domaine + Nginx** en reverse-proxy devant Node.

```
                  ┌─────────────────── VPS Infomaniak (Ubuntu) ───────────────────┐
   broderie.ch →  │  Nginx (:443 SSL)  ──reverse-proxy──►  Node/PM2 (:3000)        │
                  │                                          ├── /            → frontend/dist
                  │                                          ├── /admin       → admin/dist
                  │                                          ├── /api/v1/*    → API Express
                  │                                          └── /uploads     → images produit
                  │  MySQL (:3306, localhost)                                       │
                  └────────────────────────────────────────────────────────────────┘
```
> L'app Express sert **déjà** le frontend, l'admin et l'API (voir `backend/app.js`).
> Nginx ne fait donc que : TLS + reverse-proxy vers `localhost:3000` + cache des assets.

---

## 0. Prérequis (une seule fois)

- Accès **SSH** au VPS (clé SSH configurée dans le panel Infomaniak)
- Le domaine **broderie.ch** pointant vers l'IP du VPS (enregistrement DNS A)
- Ces valeurs prêtes : voir checklist en bas

```bash
ssh debian@<IP_DU_VPS>     # ou l'utilisateur fourni par Infomaniak
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

# Nginx + Certbot (SSL Let's Encrypt)
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

---

## 3. Récupérer le code

```bash
cd ~
git clone https://github.com/supacodigital/broderie.git
cd broderie
```

---

## 4. Variables d'environnement

```bash
# Backend
cp backend/.env.production.example backend/.env.production
nano backend/.env.production      # compléter tous les __A_DEFINIR__ / __GENERER__

# Frontend
cp frontend/.env.production.example frontend/.env.production
nano frontend/.env.production     # VITE_STRIPE_PUBLIC_KEY (pk_live), VITE_GOOGLE_CLIENT_ID
```
Générer les secrets JWT : `openssl rand -base64 64` (deux fois).

> ⚠️ Ne jamais committer ces fichiers (déjà dans `.gitignore`).

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

## 7. Nginx + SSL

Créer `/etc/nginx/sites-available/broderie` :
```nginx
server {
    listen 80;
    server_name broderie.ch www.broderie.ch;

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

# SSL Let's Encrypt (configure HTTPS + redirection 80→443 automatiquement)
sudo certbot --nginx -d broderie.ch -d www.broderie.ch
```

> ✅ `app.js` active `app.set('trust proxy', 1)` en production — les cookies httpOnly/Secure
> (refresh token, session panier) sont donc bien posés derrière Nginx. Rien à faire.

---

## 8. Stripe production

- Dashboard Stripe (mode live) → créer le **webhook** :
  `https://broderie.ch/api/v1/payments/webhook` → copier le `whsec_...` dans `.env.production`
- **Activer Twint** dans le dashboard (nécessite le compte bancaire suisse de Julie)
- Tester un paiement carte réel (petit montant) + un Twint réel

---

## 9. Vérifications finales

```bash
curl https://broderie.ch/health
```
- [ ] Site accessible en HTTPS, redirection 80→443 OK
- [ ] `/admin` charge le back-office
- [ ] Tunnel d'achat complet (desktop + mobile)
- [ ] Paiement carte + Twint (mode live) + facture QR (IBAN réel)
- [ ] Emails transactionnels reçus (SMTP Infomaniak)
- [ ] Backup automatique configuré (Swiss Backup déjà commandé — brancher mysqldump)

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
