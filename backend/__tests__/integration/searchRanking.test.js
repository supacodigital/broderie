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
let categoryId = null;

const createProduct = async ({ name, description, ean = null, sku = null, category = 101 }) => {
  const slug = `jest-rank-${STAMP}-${created.length}`;
  const [res] = await pool.query(
    `INSERT INTO products (category_id, slug, price_chf, tax_rate_id, sku, ean, stock, weight_kg, is_active)
     VALUES (?, ?, 5.00, 1, ?, ?, 10, 0.010, 1)`,
    [category, slug, sku ?? `JRK-${STAMP}-${created.length}`, ean]
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
  // Rayon au nom composé, dont les articles ne répètent pas les mots
  const [cat] = await pool.query(
    `INSERT INTO categories (parent_id, slug, sort_order) VALUES (NULL, ?, 99)`,
    [`jest-zorbalinerie-${STAMP}`]
  );
  categoryId = cat.insertId;
  await pool.query(
    `INSERT INTO category_translations (category_id, locale, name) VALUES (?, 'fr', 'Zorbalinerie & Galonnettes')`,
    [categoryId]
  );
  await createProduct({ name: 'Qwertz, ruban rose', description: 'Ruban.', category: categoryId });
  // Mot vide de MySQL dans le nom (« The ») et référence sans chiffre
  await createProduct({ name: 'Zorbalin, kit The Exotic Zebre', description: 'Kit zorbalin.', sku: `ZORB-BN-${STAMP}`.replace(/[0-9]/g, 'X') });
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
  // Caractères que l'index FULLTEXT coupe : degré, décimale, initiales
  await createProduct({ name: 'Zorbalin, pelote perlé n°5 divers', description: 'Pelote.' });
  await createProduct({ name: 'Zorbalin, Lin Belfast 12.6 fils/cm écru', description: 'Toile.' });
  await createProduct({ name: 'Zorbalin, Sampler antique J.C. Meyer', description: 'Grille.' });
  // Nom exact contre description : « confiture » seule a « cerises » dans sa description
  await createProduct({ name: 'Zorbalin, kit confiture', description: 'Confiture de cerises et de myrtilles.' });
  await createProduct({ name: 'Zorbalin, kit confiture de cerises', description: 'Kit.' });
  // Fin de nom commune avec une recherche courante : ne doit pas passer « nom exact »
  await createProduct({ name: 'Zorbalin, lot de 10 archets pour cotons zorbalinés', description: 'Archets.' });
  // Nom avec élision — « calendrier de l'Avent » ne trouvait rien
  await createProduct({ name: "Zorbalin, kit calendrier de l'Avent Gnome", description: 'Kit zorbalin.' });
    // Toile dont le nom porte un nombre de 2 chiffres
  await createProduct({ name: 'Zorbalin, toile Aïda 14, 5,4 points/cm', description: 'Toile zorbalin.' });
  await createProduct({ name: 'Zorbalin, toile Aïda 18', description: 'Toile zorbalin 140 cm.' });
});

afterAll(async () => {
  if (created.length) {
    await pool.query('DELETE FROM product_translations WHERE product_id IN (?)', [created]);
    await pool.query('DELETE FROM products WHERE id IN (?)', [created]);
  }
  if (categoryId) {
    await pool.query('DELETE FROM category_translations WHERE category_id = ?', [categoryId]);
    await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
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

  test('le nom complet avec apostrophe retrouve l\'article (droite ou typographique)', async () => {
    for (const q of ["Zorbalin, kit calendrier de l'Avent Gnome", 'zorbalin calendrier de l’Avent gnome']) {
      const { rows } = await productRepository.findAll({ locale: 'fr', q, limit: 10 });
      expect(names(rows)[0]).toBe("Zorbalin, kit calendrier de l'Avent Gnome");
    }
  });

  test('les mots vides de MySQL (« the ») n\'empêchent plus de trouver l\'article', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'the exotic zebre', limit: 10 });
    expect(names(rows)[0]).toBe('Zorbalin, kit The Exotic Zebre');
  });

  test('une référence sans chiffre saisie d\'un bloc met l\'article en tête', async () => {
    const [[row]] = await pool.query(
      "SELECT sku FROM products p JOIN product_translations pt ON pt.product_id = p.id WHERE pt.name = 'Zorbalin, kit The Exotic Zebre'"
    );
    expect(row.sku).not.toMatch(/[0-9]/);
    const { rows } = await productRepository.findAll({ locale: 'fr', q: row.sku, limit: 10 });
    expect(names(rows)[0]).toBe('Zorbalin, kit The Exotic Zebre');
  });

  test('le nom d\'un rayon trouve ses articles, même s\'ils ne contiennent pas ces mots', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'Zorbalinerie & Galonnettes', limit: 10 });
    expect(names(rows)).toContain('Qwertz, ruban rose');
  });

  /* Audit du 24/09 : ces articles étaient introuvables par leur propre nom — la
     recherche exigeait « n°5 », « 12.6 », « j.c. », que l'index découpe. */
  test.each([
    'Zorbalin, pelote perlé n°5 divers',
    'Zorbalin, Lin Belfast 12.6 fils/cm écru',
    'Zorbalin, Sampler antique J.C. Meyer',
  ])('« %s » est trouvé par son nom exact', async (name) => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: name, limit: 10 });
    expect(names(rows)[0]).toBe(name);
  });

  test('le nom exact, avec ou sans la marque, passe devant une description qui reprend les mots', async () => {
    for (const q of ['Zorbalin, kit confiture de cerises', 'kit confiture de cerises']) {
      const { rows } = await productRepository.findAll({ locale: 'fr', q, limit: 10 });
      expect(names(rows)[0]).toBe('Zorbalin, kit confiture de cerises');
    }
  });

  test('une simple fin de nom commune ne compte pas comme « nom exact »', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'cotons zorbalinés', limit: 10 });
    const archets = rows.find((r) => r.name.startsWith('Zorbalin, lot de 10 archets'));
    expect(Number(archets?.relevance ?? 0)).toBeLessThan(500);
  });

  test('une recherche sans nombre garde le classement du texte', async () => {
    const { rows } = await productRepository.findAll({ locale: 'fr', q: 'zorbalin', limit: 20 });
    expect(rows).toHaveLength(13);
    rows.forEach((r) => expect(Number(r.relevance)).toBeLessThan(100));
  });
});
