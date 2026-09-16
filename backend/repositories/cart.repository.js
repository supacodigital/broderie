const { pool } = require('../config/db');
const { effectivePriceSql, promoActiveSql } = require('../utils/promo.utils');

// Récupère le panier avec ses articles — par user_id ou session_id
const findCart = async ({ userId, sessionId }) => {
  const condition = userId ? 'user_id = ?' : 'session_id = ?';
  const param = userId || sessionId;

  const [carts] = await pool.execute(
    `SELECT id FROM carts WHERE ${condition} LIMIT 1`,
    [param]
  );
  return carts[0] || null;
};

// Récupère les articles d'un panier avec les infos produit
const findCartItems = async (cartId, locale = 'fr') => {
  const [items] = await pool.execute(
    /* Le prix du panier est TOUJOURS recalculé depuis le produit, jamais lu depuis
       price_snapshot : une promotion peut démarrer ou expirer pendant qu'un panier
       dort. Sans ce recalcul, un panier rempli pendant une promo garderait le prix
       promo indéfiniment (ou l'inverse, une promo démarrée ne s'appliquerait pas).
       Le modificateur de variante, lui, reste porté par le snapshot d'origine :
       on réapplique donc l'écart entre le snapshot et le prix produit d'alors.
       price_snapshot est conservé en base comme trace de la saisie initiale. */
    `SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
            ci.price_snapshot,
            /* Vente à la coupe : quantity compte des tronçons de length_step_cm,
               donc le prix unitaire doit être celui du tronçon et non du mètre.
               Sans cette division, une bande à 3.00/m facturait 3.00 par tranche
               de 10 cm — soit 18.00 pour 60 cm au lieu de 1.80. */
            (CASE WHEN p.sold_by_length = 1
                  THEN (${effectivePriceSql('p')} * p.length_step_cm / 100)
                  ELSE ${effectivePriceSql('p')} END)
              + COALESCE(pv.price_modifier, 0) AS unit_price,
            ci.tax_rate_snapshot,
            ${promoActiveSql('p')} AS is_promo_active,
            COALESCE(pt.name, pt_fr.name) AS product_name,
            COALESCE(pt.slug, pt_fr.slug) AS product_slug,
            pi.url AS image_url,
            p.stock, p.weight_kg, p.is_active, p.is_made_to_order, p.deleted_at,
            p.sold_by_length, p.length_step_cm, p.length_min_cm,
            p.category_id,
            c.slug AS category_slug
     FROM cart_items ci
     INNER JOIN products p ON p.id = ci.product_id
     LEFT JOIN product_translations pt ON pt.product_id = ci.product_id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = ci.product_id AND pt_fr.locale = 'fr'
     LEFT JOIN product_images pi ON pi.product_id = ci.product_id AND pi.is_primary = 1
     LEFT JOIN product_variants pv ON pv.id = ci.variant_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ci.cart_id = ?`,
    [locale, cartId]
  );
  return items;
};

// Crée un nouveau panier
const createCart = async ({ userId, sessionId }) => {
  const [result] = await pool.execute(
    `INSERT INTO carts (user_id, session_id) VALUES (?, ?)`,
    [userId || null, sessionId || null]
  );
  return result.insertId;
};

// Récupère un article spécifique du panier
const findCartItem = async (cartId, productId, variantId) => {
  const [rows] = await pool.execute(
    `SELECT id, quantity FROM cart_items
     WHERE cart_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
     LIMIT 1`,
    [cartId, productId, variantId || null, variantId || null]
  );
  return rows[0] || null;
};

// Récupère un article par son id
const findCartItemById = async (itemId, cartId) => {
  const [rows] = await pool.execute(
    `SELECT id, cart_id, product_id, quantity FROM cart_items
     WHERE id = ? AND cart_id = ?
     LIMIT 1`,
    [itemId, cartId]
  );
  return rows[0] || null;
};

// Ajoute un article au panier
const addItem = async ({ cartId, productId, variantId, quantity, priceSnapshot, taxRateSnapshot }) => {
  const [result] = await pool.execute(
    `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, price_snapshot, tax_rate_snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cartId, productId, variantId || null, quantity, priceSnapshot, taxRateSnapshot]
  );
  return result.insertId;
};

// Met à jour la quantité d'un article
const updateItemQuantity = async (itemId, quantity) => {
  await pool.execute(
    `UPDATE cart_items SET quantity = ? WHERE id = ?`,
    [quantity, itemId]
  );
};

// Supprime un article du panier
const removeItem = async (itemId) => {
  await pool.execute(
    `DELETE FROM cart_items WHERE id = ?`,
    [itemId]
  );
};

// Vide le panier après validation d'une commande
const clearCart = async (cartId) => {
  await pool.execute(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
  await pool.execute(`DELETE FROM carts WHERE id = ?`, [cartId]);
};

// Rattache un panier anonyme à un utilisateur après connexion
const mergeCart = async (sessionId, userId) => {
  await pool.execute(
    `UPDATE carts SET user_id = ?, session_id = NULL WHERE session_id = ?`,
    [userId, sessionId]
  );
};

module.exports = {
  findCart, findCartItems, createCart,
  findCartItem, findCartItemById,
  addItem, updateItemQuantity, removeItem, clearCart, mergeCart,
};
