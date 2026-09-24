const { pool } = require('../config/db');
const { effectivePriceSql, promoActiveSql } = require('../utils/promo.utils');

// Récupère le panier avec ses articles — par user_id ou session_id
const findCart = async ({ userId, sessionId }) => {
  const condition = userId ? 'user_id = ?' : 'session_id = ?';
  const param = userId || sessionId;

  /* Un compte ne doit avoir qu'un panier. L'ancienne fusion à la connexion en
     laissait parfois deux, dont un seul affiché (CLI-13) : s'il en reste, ils
     sont réunis au premier accès — un cas rare, détecté par la même requête
     (LIMIT 2). `ORDER BY id` : c'est toujours le même panier qui est lu. */
  const [carts] = await pool.execute(
    `SELECT id FROM carts WHERE ${condition} ORDER BY id ASC LIMIT 2`,
    [param]
  );
  if (userId && carts.length > 1) {
    await mergeCart(null, userId);
  }
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

/* Rattache le panier anonyme au compte après connexion (CLI-13).

   Le panier anonyme était simplement réattribué au compte : si la cliente avait
   déjà un panier sur son compte, elle en avait désormais DEUX, et un seul était
   affiché — les articles ajoutés avant la connexion disparaissaient. Ils sont
   désormais versés dans le panier du compte, qui reste unique :
   - article déjà présent : la plus grande des deux quantités (rien de perdu,
     rien de doublé par mégarde) ;
   - autre article : il rejoint le panier du compte.
   Les paniers en double laissés par l'ancien comportement sont fusionnés au
   passage. Une boucle sur les PANIERS (un, rarement deux), pas sur les
   articles : chaque panier est traité par trois requêtes ensemblistes. */
const mergeCart = async (sessionId, userId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Sans session d'invitée : seuls les paniers en double du compte sont réunis
    const [guestCarts] = sessionId
      ? await connection.execute(`SELECT id FROM carts WHERE session_id = ? FOR UPDATE`, [sessionId])
      : [[]];
    const [ownCarts] = await connection.execute(
      `SELECT id FROM carts WHERE user_id = ? ORDER BY id ASC FOR UPDATE`,
      [userId]
    );

    if (ownCarts.length === 0 && sessionId) {
      // Pas encore de panier sur le compte : le panier anonyme le devient
      await connection.execute(
        `UPDATE carts SET user_id = ?, session_id = NULL WHERE session_id = ?`,
        [userId, sessionId]
      );
      await connection.commit();
      return;
    }
    if (ownCarts.length === 0) {
      await connection.commit();
      return;
    }

    const targetId = ownCarts[0].id;
    const sourceIds = [...guestCarts, ...ownCarts.slice(1)].map((c) => c.id);

    for (const sourceId of sourceIds) {
      await connection.execute(
        `UPDATE cart_items t
         JOIN cart_items s ON s.cart_id = ? AND s.product_id = t.product_id AND s.variant_id <=> t.variant_id
         SET t.quantity = GREATEST(t.quantity, s.quantity)
         WHERE t.cart_id = ?`,
        [sourceId, targetId]
      );
      await connection.execute(
        `UPDATE cart_items s
         LEFT JOIN cart_items t ON t.cart_id = ? AND t.product_id = s.product_id AND t.variant_id <=> s.variant_id
         SET s.cart_id = ?
         WHERE s.cart_id = ? AND t.id IS NULL`,
        [targetId, targetId, sourceId]
      );
      await connection.execute(`DELETE FROM cart_items WHERE cart_id = ?`, [sourceId]);
      await connection.execute(`DELETE FROM carts WHERE id = ?`, [sourceId]);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/* Retire du panier de la cliente les articles d'une commande carte / Twint,
   une fois son paiement accepté (CLI-13). Jusque-là, le panier est conservé :
   la cliente qui quitte l'étape de paiement pour revenir à la boutique le
   retrouve intact. Une seule requête pour tous les articles. */
const removeOrderedItems = async (userId, items) => {
  if (!userId || !items?.length) return;
  const pairs = items.map(() => '(?, ?)').join(', ');
  await pool.execute(
    `DELETE ci FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     WHERE c.user_id = ? AND (ci.product_id, COALESCE(ci.variant_id, 0)) IN (${pairs})`,
    [userId, ...items.flatMap((item) => [item.product_id, item.variant_id ?? 0])]
  );
};

module.exports = {
  findCart, findCartItems, createCart,
  findCartItem, findCartItemById,
  addItem, updateItemQuantity, removeItem, clearCart, mergeCart, removeOrderedItems,
};
