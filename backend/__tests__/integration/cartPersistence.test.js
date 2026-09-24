require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const cartRepository = require('../../repositories/cart.repository');
const orderRepository = require('../../repositories/order.repository');

/* Non-régression CLI-13 — « le retour vers la boutique vide complètement le
   panier ».

   Deux causes, toutes deux sur la vraie base :
   - carte / Twint : le panier était vidé dès la création de la commande, avant
     le paiement ; la cliente qui revenait à la boutique depuis l'étape de
     paiement trouvait un panier vide ;
   - connexion : le panier d'invitée était rattaché au compte sans fusion ; un
     compte qui avait déjà un panier en avait alors deux, un seul affiché. */

const validAddress = {
  first_name: 'Test', last_name: 'Panier',
  street: 'Chemin du Collège', street_number: '6',
  zip: '1509', city: 'Vucherens', canton: 'VD',
};

/* Deux articles vendus à la pièce. La base de test n'en contient qu'un (le
   produit du seed) : le second est créé pour ce fichier, puis supprimé — il ne
   figure que dans des paniers, jamais dans une commande. */
const SECOND_SKU = `TEST-CART-${Date.now()}`;
let secondProductId = null;

const pickTwoProducts = async () => {
  const res = await request(app)
    .get('/api/v1/products')
    .query({ locale: 'fr', in_stock: 'true', limit: 50 });
  const first = (res.body.data ?? []).find((p) => p.stock >= 5 && !p.sold_by_length);

  const [result] = await pool.query(
    `INSERT INTO products (category_id, slug, price_chf, tax_rate_id, sku, stock, weight_kg, is_active)
     VALUES (101, ?, 7.50, 1, ?, 50, 0.050, 1)`,
    [SECOND_SKU.toLowerCase(), SECOND_SKU]
  );
  secondProductId = result.insertId;
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug)
     VALUES (?, 'fr', 'Second produit de test panier', 'Article temporaire des tests CLI-13.', ?)`,
    [secondProductId, SECOND_SKU.toLowerCase()]
  );

  return first ? [first, { id: secondProductId }] : [];
};

const cartLines = async (token, cookie = null) => {
  const req = request(app).get('/api/v1/cart').set('Authorization', `Bearer ${token}`);
  if (cookie) req.set('Cookie', cookie);
  const res = await req;
  return (res.body.data?.items ?? []).map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
};

const addToCart = (productId, quantity, { token = null, cookie = null } = {}) => {
  const req = request(app).post('/api/v1/cart/items').send({ productId, quantity });
  if (token) req.set('Authorization', `Bearer ${token}`);
  if (cookie) req.set('Cookie', cookie);
  return req;
};

const userCartCount = async (userId) => {
  const [[row]] = await pool.execute('SELECT COUNT(*) AS n FROM carts WHERE user_id = ?', [userId]);
  return Number(row.n);
};

describe('CLI-13 — le panier ne se vide plus', () => {
  let products = [];

  beforeAll(async () => {
    products = await pickTwoProducts();
  });

  afterAll(async () => {
    if (!secondProductId) return;
    await pool.query('DELETE FROM cart_items WHERE product_id = ?', [secondProductId]);
    await pool.query('DELETE FROM product_translations WHERE product_id = ?', [secondProductId]);
    await pool.query('DELETE FROM products WHERE id = ?', [secondProductId]);
  });

  test('la connexion fusionne le panier d\'invitée avec celui du compte, sans rien perdre', async () => {
    expect(products).toHaveLength(2);
    const [a, b] = products;
    const { token, userId } = await registerVerifiedUser('cart.merge');

    // Panier existant sur le compte
    await addToCart(a.id, 1, { token });

    // Visite en invitée : autre quantité du même article + un autre article
    const guest = await addToCart(a.id, 3);
    const cookie = guest.headers['set-cookie']?.find((c) => c.startsWith('cartSession='))?.split(';')[0];
    expect(cookie).toBeTruthy();
    await addToCart(b.id, 2, { cookie });

    // Connexion : le panier affiché contient tout, en une seule ligne par article
    const lines = await cartLines(token, cookie);
    expect(lines).toHaveLength(2);
    expect(lines).toEqual(expect.arrayContaining([
      { product_id: a.id, quantity: 3 }, // la plus grande quantité, pas la somme
      { product_id: b.id, quantity: 2 },
    ]));
    expect(await userCartCount(userId)).toBe(1);
  });

  test('un compte laissé avec deux paniers par l\'ancien comportement est ramené à un seul', async () => {
    const [a, b] = products;
    const { token, userId } = await registerVerifiedUser('cart.dupe');
    await addToCart(a.id, 1, { token });

    // Second panier du compte, tel que l'ancienne fusion le laissait
    const dupeCartId = await cartRepository.createCart({ userId });
    await cartRepository.addItem({ cartId: dupeCartId, productId: b.id, variantId: null, quantity: 2, priceSnapshot: 1, taxRateSnapshot: 8.1 });
    expect(await userCartCount(userId)).toBe(2);

    // Une connexion depuis une session d'invitée déclenche la fusion
    const guest = await request(app).get('/api/v1/cart');
    const cookie = guest.headers['set-cookie']?.find((c) => c.startsWith('cartSession='))?.split(';')[0];
    const lines = await cartLines(token, cookie);

    expect(lines).toEqual(expect.arrayContaining([
      { product_id: a.id, quantity: 1 },
      { product_id: b.id, quantity: 2 },
    ]));
    expect(await userCartCount(userId)).toBe(1);
  });

  /* Cas des clientes déjà touchées en production : leur session est restaurée
     sans passer par une connexion d'invitée. Les deux paniers sont réunis dès
     le premier affichage du panier. */
  test('deux paniers sur un compte : réunis au premier affichage, sans reconnexion', async () => {
    const [a, b] = products;
    const { token, userId } = await registerVerifiedUser('cart.heal');
    await addToCart(a.id, 1, { token });
    const dupeCartId = await cartRepository.createCart({ userId });
    await cartRepository.addItem({ cartId: dupeCartId, productId: b.id, variantId: null, quantity: 1, priceSnapshot: 1, taxRateSnapshot: 8.1 });

    await cartLines(token);                  // premier accès : fusion
    const lines = await cartLines(token);    // affichage suivant : tout y est

    expect(lines).toEqual(expect.arrayContaining([
      { product_id: a.id, quantity: 1 },
      { product_id: b.id, quantity: 1 },
    ]));
    expect(await userCartCount(userId)).toBe(1);
  });

  test('carte : le panier est conservé à la création de la commande', async () => {
    const [a] = products;
    const { token } = await registerVerifiedUser('cart.card');
    await addToCart(a.id, 2, { token });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: validAddress, payment_method: 'card', items: [] });
    expect(res.status).toBe(201);

    // Retour à la boutique depuis l'étape de paiement : panier intact
    expect(await cartLines(token)).toEqual([{ product_id: a.id, quantity: 2 }]);
  });

  test('facture : le panier est vidé, la commande est définitive', async () => {
    const [a] = products;
    const { token } = await registerVerifiedUser('cart.invoice');
    await addToCart(a.id, 1, { token });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: validAddress, payment_method: 'invoice_qr', items: [] });
    expect(res.status).toBe(201);

    expect(await cartLines(token)).toEqual([]);
  });

  test('paiement accepté : seuls les articles payés sortent du panier', async () => {
    const [a, b] = products;
    const { token, userId } = await registerVerifiedUser('cart.paid');
    await addToCart(a.id, 1, { token });
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: validAddress, payment_method: 'twint', items: [] });
    expect(res.status).toBe(201);

    // Pendant le paiement, la cliente ajoute un autre article
    await addToCart(b.id, 1, { token });

    const order = await orderRepository.findById(res.body.data.id);
    await cartRepository.removeOrderedItems(userId, order.items);

    expect(await cartLines(token)).toEqual([{ product_id: b.id, quantity: 1 }]);
  });
});
