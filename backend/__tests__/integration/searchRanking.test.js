require('dotenv').config();
const { pool } = require('../../config/db');
const productRepository = require('../../repositories/product.repository');

/* Non-régression CLI-01 — « moteur de recherche inopérant (ex. cotons moulinés
   introuvables) ». La recherche trouvait les articles mais les classait mal dès
   que la saisie contenait un nombre :
   - un produit sans EAN recevait un score NULL et tombait en fin de liste ;
   - un kit citant le numéro dans sa description passait devant l'article qui
     le porte dans son nom ;
   - un nombre de moins de 3 caractères (« aida 14 ») excluait l'article voulu.
   Les produits de test portent des mots inventés pour ne rien croiser d'autre. */

const STAMP = Date.now();
const created = [];

const createProduct = async ({ name, description, ean = null }) => {
  const slug = `jest-rank-${STAMP}-${created.length}`;
  const [res] = await pool.query(
    `INSERT INTO products (category_id, slug, price_chf, tax_rate_id, sku, ean, stock, weight_kg, is_active)
     VALUES (101, ?, 5.00, 1, ?, ?, 10, 0.010, 1)`,
    [slug, `JRK-${STAMP}-${created.length}`, ean]
  );
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug)
     VALUES (?, 'fr', ?, ?, ?)`,
    [res.insertId, name, description, slug]
  );
  created.push(res.insertId);
  return res.insertId;
};

beforeAll(async () => {
  // Échevette SANS EAN, numéro dans le nom — comme les moulinés DMC
  await createProduct({ name: 'Zorbalin mouliné N° 97310', description: 'Échevette de coton zorbalin.' });
  // Kit AVEC EAN, numéro répété dans la notice — comme les kits Permin
  await createProduct({
    name: 'Zorbalin, kit Troll',
    description: 'Fils fournis : 97310 97310 97310 97310 97310 97310 97310 97310 zorbalin.',
    ean: '5700000000001',
  });
  // Autre article portant le même numéro dans un nom plus long — ex æquo sur le score
  await createProduct({ name: 'Zorbalin Etoile art 617, échevette 8 mètres 97310', description: 'Fil zorbalin.' });
  // Toile dont le nom porte un nombre de 2 chiffres
  await createProduct({ name: 'Zorbalin, toile Aïda 14, 5,4 points/cm', description: 'Toile zorbalin.' });
  await createProduct({ name: 'Zorbalin, toile Aïda 18', description: 'Toile zorbalin 140 cm.' });
});

afterAll(async () => {
  if (created.length) {
    await pool.query('DELETE FROM product_translations WHERE product_id IN (?)', [created]);
    await pool.query('DELETE FROM products WHERE id IN (?)', [created]);
  }
  await pool.end().catch(() => {});
});

const names = (rows) => rows.map((r) => r.name);

describe('CLI-01 — classement de la recherche', () => {
  test('le numéro saisi seul met en tête l\'article qui le porte dans son nom', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: '97310', limit: 10 });
    expect(names(rows)[0]).toBe('Zorbalin mouliné N° 97310');
  });

  test('un produit sans EAN n\'a plus un score nul', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'zorbalin 97310', limit: 10 });
    const mouline = rows.find((r) => r.name === 'Zorbalin mouliné N° 97310');
    expect(mouline.relevance).not.toBeNull();
    expect(names(rows)[0]).toBe('Zorbalin mouliné N° 97310');
  });

  test('un nombre de 2 chiffres ne fait plus disparaître l\'article (« aida 14 »)', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'zorbalin aida 14', limit: 10 });
    expect(names(rows)[0]).toBe('Zorbalin, toile Aïda 14, 5,4 points/cm');
  });

  /* Deux noms portent le même numéro : même score. L'ordre était arbitraire —
     constaté en production, « 310 » plaçait tantôt le mouliné, tantôt l'Etoile
     en tête. Le nom le plus court (correspondance la plus directe) passe devant. */
  test('à score égal, le nom le plus court passe devant, toujours dans le même ordre', async () => {
    for (let i = 0; i < 3; i += 1) {
      const { rows } = await productRepository.findAll({ locale: 'fr', q: '97310', limit: 10 });
      expect(names(rows).slice(0, 2)).toEqual([
        'Zorbalin mouliné N° 97310',
        'Zorbalin Etoile art 617, échevette 8 mètres 97310',
      ]);
    }
  });

  test('une recherche sans nombre garde le classement du texte', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'zorbalin', limit: 10 });
    expect(rows).toHaveLength(5);
    rows.forEach((r) => expect(Number(r.relevance)).toBeLessThan(100));
  });
});
