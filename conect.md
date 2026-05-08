# Guide de démarrage — Au Point-Compté

---

## 1. Démarrer le projet

Ouvrir **4 terminaux** et lancer chaque commande dans le bon dossier.

### Terminal 1 — Backend (API)

```bash
cd /Users/kevinkhek/Desktop/SupacoDigital/broderie/backend
npm run dev
```

Tourne sur : **http://localhost:3000**
Vérifier : http://localhost:3000/health → `{"success":true}`

---

### Terminal 2 — Frontend boutique

```bash
cd /Users/kevinkhek/Desktop/SupacoDigital/broderie/frontend
npm run dev
```

Tourne sur : **http://localhost:5175**

---

### Terminal 3 — Admin back-office

```bash
cd /Users/kevinkhek/Desktop/SupacoDigital/broderie/admin
npm run dev
```

Tourne sur : **http://localhost:5174**

---

### Terminal 4 — Stripe webhook (obligatoire pour les paiements)

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

> Copier le `whsec_...` affiché et le coller dans `backend/.env` à la clé `STRIPE_WEBHOOK_SECRET`, puis redémarrer le backend.

---

## 2. Identifiants de connexion

### Admin back-office — http://localhost:5174

| Rôle | Email | Mot de passe |
|---|---|---|
| **Super Admin** | superadmin@broderie.ch | Test1234! |
| Admin | admin@broderie.ch | Test1234! |
| Admin (test) | testadmin@broderie.ch | Test1234! |

> Le **Super Admin** peut créer/supprimer des comptes admin et exécuter la migration des 1800 clients.
> L'**Admin** peut tout gérer sauf les comptes admin.

---

### Boutique client — http://localhost:5175

| Rôle | Email | Mot de passe |
|---|---|---|
| Client test | test@test.ch | Test1234! |

---

## 3. Codes promo de test

| Code | Réduction | Commande minimum |
|---|---|---|
| `BIENVENUE10` | 10% | CHF 30.00 |
| `ETE2026` | 15% | CHF 50.00 |
| `FIDELE5` | CHF 5.00 fixe | CHF 25.00 |

---

## 4. Cartes Stripe de test

Utiliser ces numéros dans le formulaire de paiement par carte :

| Carte | Numéro | Résultat |
|---|---|---|
| Visa — succès | `4242 4242 4242 4242` | Paiement accepté |
| Visa — refusée | `4000 0000 0000 0002` | Paiement refusé |
| Authentification 3DS | `4000 0025 0000 3155` | Demande confirmation |

Date d'expiration : n'importe quelle date future (ex: `12/28`)
CVC : n'importe quels 3 chiffres (ex: `123`)

---

## 5. Base de données

| Paramètre | Valeur |
|---|---|
| Hôte | 127.0.0.1 |
| Port | 8889 |
| Base | broderie |
| Utilisateur | root |
| Mot de passe | root |

Connexion rapide depuis le terminal :
```bash
mysql -h 127.0.0.1 -P 8889 -u root -proot broderie
```

---

## 6. Ordre de démarrage recommandé

```
1. Backend    → npm run dev
2. Frontend   → npm run dev
3. Admin      → npm run dev
4. Stripe     → stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

> Le backend doit toujours être démarré **en premier** — le frontend et l'admin en dépendent.
