# Déploiement RECETTE sur VPS Infomaniak — accès par IP (sans toucher au domaine)

> 🎯 Objectif : déployer et tester le site **à côté** de l'existant de Julie, sur l'**IP du VPS**,
> **SANS toucher** au domaine `broderie.ch` ni aux emails (qui restent sur Hetzner).
> Pas de bascule DNS, pas de SSL Let's Encrypt ce soir.

> ⚠️ Ce guide remplace [DEPLOIEMENT_INFOMANIAK.md](DEPLOIEMENT_INFOMANIAK.md) **pour la recette uniquement**.
> Le déploiement de production complet (domaine + SSL + DNS) se fera plus tard avec ce dernier.

---

## ⚠️ Le point clé : cookies + HTTP

L'app pose des cookies `Secure` quand `NODE_ENV=production`. **Un cookie `Secure` ne passe pas en HTTP.**
Comme on accède par `http://<IP>` (sans SSL), il faut lancer la recette en **`NODE_ENV=development`**
pour que la connexion/session/panier fonctionnent.

> Conséquence : on teste l'app fonctionnellement, mais PAS le comportement strict de prod
> (cookies Secure, trust proxy). Ça, ce sera validé au vrai go-live avec HTTPS.

---

## 1. Stack (une fois)

```bash
ssh <user>@<IP_DU_VPS>
sudo apt update && sudo apt upgrade -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 22 && nvm use 22 && nvm alias default 22
npm install -g pm2
sudo apt install -y mysql-server git
sudo mysql_secure_installation
```

## 2. Base de données

```bash
sudo mysql
```
```sql
CREATE DATABASE broderie CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'broderie_app'@'localhost' IDENTIFIED BY '<MDP_FORT>';
GRANT SELECT, INSERT, UPDATE, DELETE ON broderie.* TO 'broderie_app'@'localhost';
FLUSH PRIVILEGES; EXIT;
```
```bash
cd ~/broderie/database
sudo mysql broderie < schema.sql
for f in migrations/0*.sql; do echo "→ $f"; sudo mysql broderie < "$f"; done
sudo mysql broderie < seeds.sql      # données de démo (recette → OK)
```

## 3. Code

```bash
cd ~ && git clone https://github.com/supacodigital/broderie.git && cd broderie
```

## 4. Variables d'env — adaptées « recette par IP »

```bash
cp backend/.env.production.example backend/.env       # ⚠️ .env (pas .env.production) car NODE_ENV=development
nano backend/.env
```
Dans `backend/.env`, valeurs SPÉCIFIQUES à la recette :
```env
NODE_ENV=development                 # ← cookies non-Secure, fonctionne en HTTP
PORT=3000
CLIENT_URL=http://<IP_DU_VPS>:3000   # ← l'IP, pas broderie.ch
ADMIN_URL=http://<IP_DU_VPS>:3000
DB_HOST=127.0.0.1
DB_NAME=broderie  DB_USER=broderie_app  DB_PASSWORD=<MDP_FORT>
JWT_ACCESS_SECRET=<openssl rand -base64 64>
JWT_REFRESH_SECRET=<openssl rand -base64 64>
# Stripe : tes clés TEST (recette) — carte/Twint en mode démo
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Emails : Mailtrap (recette) — emails capturés, pas envoyés
MAIL_HOST=sandbox.smtp.mailtrap.io  MAIL_PORT=2525  MAIL_USER=...  MAIL_PASSWORD=...
# Facture QR + Click&Collect : vraies valeurs déjà connues
QR_INVOICE_IBAN=CH4509000000167981317
QR_INVOICE_ADDRESS=Rue de Vuarrengel 10  QR_INVOICE_ZIP=1418  QR_INVOICE_CITY=Vuarrens
PICKUP_ADDRESS=Rue de Vuarrengel 10  PICKUP_ZIP=1418  PICKUP_CITY=Vuarrens
PICKUP_HOURS=Mardi–Samedi 9h–12h et 13h30–18h30
SWISS_POST_KUNDENNUMMER=40143484  SWISS_POST_FRANKIERNUMMER=40143484
# (SWISS_POST_CLIENT_ID laissé vide → étiquettes en mode mock)
```

Frontend + admin (servis par Express en interne, API relative → simple) :
```bash
cp frontend/.env.production.example frontend/.env.production
cp admin/.env.production.example   admin/.env.production
# Dans les deux : VITE_STRIPE_PUBLIC_KEY=pk_test_... (recette)
# admin : VITE_SHOP_URL=http://<IP_DU_VPS>:3000
```

## 5. Build + démarrage

```bash
cd ~/broderie
cd backend  && npm ci && cd ..              # garder devDeps (NODE_ENV=development)
cd frontend && npm ci && npm run build && cd ..
cd admin    && npm ci && npm run build && cd ..

# Ouvrir le port 3000 dans le firewall du VPS si besoin (panel Infomaniak ou ufw)
# sudo ufw allow 3000

cd backend && pm2 start app.js --name broderie-recette && pm2 logs broderie-recette
```

## 6. Tester

Depuis ton navigateur :
- Boutique : `http://<IP_DU_VPS>:3000`
- Admin :    `http://<IP_DU_VPS>:3000/admin`
- API :      `http://<IP_DU_VPS>:3000/health`

À valider :
- [ ] Boutique s'affiche, catalogue, fiche produit
- [ ] Inscription / connexion (cookies OK en HTTP car NODE_ENV=development)
- [ ] Tunnel d'achat → facture QR (PDF avec vrai IBAN) ou Click & Collect
- [ ] Paiement carte/Twint en mode test Stripe
- [ ] Admin : login, dashboard, gestion commande, étiquette (mock)
- [ ] Emails visibles dans Mailtrap

---

## Ce qu'on NE fait PAS ce soir (intouché)

- ❌ DNS de `broderie.ch` (reste sur Hetzner — site + email de Julie intacts)
- ❌ SSL Let's Encrypt (pas de domaine pointant vers le VPS)
- ❌ Stripe live, SMTP réel, migration des 1800 clients

Tout ça = le vrai go-live, plus tard, via [DEPLOIEMENT_INFOMANIAK.md](DEPLOIEMENT_INFOMANIAK.md).

---

*Supaco Digital — Au Point-Compté — Recette VPS — 2026*
