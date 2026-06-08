# Reprise de données — Migration PrestaShop → Nouvelle boutique

**Objet : RE: Pour la reprise de données**

Bonjour Christophe,

Merci pour ces questions précises. Voici mes réponses point par point.

---

## Prestation prévue

On part sur la **Solution 2** : vous exportez depuis PrestaShop, je m'occupe de l'import. Je prends en charge tout le travail de transformation et d'intégration dans la nouvelle base. Vous me fournissez simplement les fichiers d'export bruts.

---

## 1. Format de fichier attendu

- **CSV** uniquement
- Séparateur : **point-virgule `;`**
- Encodage : **UTF-8** (sans BOM)
- Première ligne = en-têtes de colonnes (noms techniques ci-dessous)
- Un fichier CSV distinct par type de donnée (clients, adresses, fournisseurs, articles, photos)

---

## 2. Liaison des photos

Par **table de correspondance séparée** (pas d'URL absolue). Un fichier `product_images.csv` qui relie chaque photo à l'ID PrestaShop de l'article via une colonne `product_ref`. Vous me livrez les fichiers images dans un dossier à part (les noms de fichiers doivent correspondre à ceux indiqués dans le CSV). Je me charge de la conversion, du renommage et de l'hébergement.

---

## 3. Tables de correspondance (mapping)

> **Important** : on ne récupère **pas** les mots de passe (impossible techniquement et non sécurisé). Chaque client recevra un email de réinitialisation à la mise en ligne.

### Fichier `customers.csv` — Clients

| Nom usuel | Nom technique | Type | Taille max | Obligatoire | Format |
|---|---|---|---|---|---|
| Référence client PrestaShop | `legacy_id` | Texte | 50 | Oui | — |
| Email | `email` | Texte | 255 | Oui | unique, minuscules |
| Prénom | `first_name` | Texte | 100 | Oui | — |
| Nom | `last_name` | Texte | 100 | Oui | — |
| Langue | `locale` | Texte | 2 | Non | `fr`, `de` ou `en` (défaut `fr`) |

### Fichier `addresses.csv` — Adresses

| Nom usuel | Nom technique | Type | Taille max | Obligatoire | Format |
|---|---|---|---|---|---|
| Réf. client PrestaShop | `customer_legacy_id` | Texte | 50 | Oui | doit exister dans customers.csv |
| Libellé | `label` | Texte | 100 | Non | ex. « Domicile » |
| Rue + n° | `street` | Texte | 255 | Oui | — |
| Ville | `city` | Texte | 100 | Oui | — |
| NPA | `zip` | Texte | 10 | Oui | — |
| Pays | `country` | Texte | 2 | Non | `CH` par défaut |
| Canton | `canton` | Texte | 2 | Non | ex. `VD`, `GE` |

### Fichier `suppliers.csv` — Fournisseurs

| Nom usuel | Nom technique | Type | Taille max | Obligatoire | Format |
|---|---|---|---|---|---|
| Nom fournisseur | `name` | Texte | 255 | Oui | — |
| Personne de contact | `contact_name` | Texte | 255 | Non | — |
| Email | `email` | Texte | 255 | Non | — |
| Téléphone | `phone` | Texte | 50 | Non | — |
| Adresse | `address` | Texte | — | Non | — |
| Notes | `notes` | Texte | — | Non | — |

### Fichier `products.csv` — Articles

| Nom usuel | Nom technique | Type | Taille max | Obligatoire | Format |
|---|---|---|---|---|---|
| Référence article PrestaShop | `legacy_id` | Texte | 50 | Oui | sert à lier photos/variantes |
| Référence interne (SKU) | `sku` | Texte | 100 | Non | unique si fourni |
| Nom de l'article | `name` | Texte | 255 | Oui | — |
| Description | `description` | Texte | — | Non | HTML accepté |
| Catégorie | `category` | Texte | 255 | Oui | nom de la catégorie |
| Fournisseur | `supplier_name` | Texte | 255 | Non | doit exister dans suppliers.csv |
| Prix TTC (CHF) | `price_chf` | Nombre | 10,2 | Oui | ex. `19.90` (point décimal) |
| Prix barré (CHF) | `compare_price_chf` | Nombre | 10,2 | Non | ex. `29.90` |
| Taux TVA | `tax_rate` | Nombre | — | Oui | `8.1`, `2.6` ou `3.8` |
| Stock | `stock` | Nombre | — | Oui | entier |
| Poids (kg) | `weight_kg` | Nombre | 8,3 | Oui | ex. `0.250` — requis pour les frais de port |
| Langue de la fiche | `locale` | Texte | 2 | Non | `fr`, `de` ou `en` (défaut `fr`) |

> Pour les articles traduits : une ligne par langue avec le même `legacy_id` et la `locale` correspondante.

### Fichier `product_images.csv` — Photos

| Nom usuel | Nom technique | Type | Taille max | Obligatoire | Format |
|---|---|---|---|---|---|
| Réf. article PrestaShop | `product_ref` | Texte | 50 | Oui | doit exister dans products.csv |
| Nom du fichier image | `filename` | Texte | 255 | Oui | ex. `12345-1.jpg` |
| Texte alternatif | `alt` | Texte | 255 | Non | — |
| Image principale | `is_primary` | Nombre | — | Non | `1` = principale, `0` = secondaire |
| Ordre d'affichage | `sort_order` | Nombre | — | Non | entier |

---

## Format des dates

Pour tout champ date (si applicable) : **AAAA-MM-JJ** (norme ISO), ex. `2026-05-30`.

---

## Commandes ouvertes

Pour les commandes en cours, on en discute de vive voix mercredi — la reprise des commandes est plus délicate (statuts, paiements, lignes figées) et mérite qu'on cadre le périmètre exact ensemble. Pour l'instant, concentrez l'export sur **clients, adresses, fournisseurs, articles et photos**.

Je reste à disposition pour toute précision.

Cordialement,
Kévin
