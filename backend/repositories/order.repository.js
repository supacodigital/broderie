const { pool } = require('../config/db');
const { AppError } = require('../middlewares/errorHandler');
const { displayComparePriceSql } = require('../utils/promo.utils');
const { compareUnitPrice } = require('../utils/sale.utils');

// Création d'une commande — transaction atomique (stock + commande + items + coupon + paiement)
const createOrder = async ({ userId, items, subtotal, shippingCost, taxAmount, total, status = 'pending', address = null, billingAddress = null, couponCode = null, discount = 0, couponId = null, paymentMethod = 'twint', qrReference = null, locale = 'fr', wantsPrintedInvoice = false, confirmed = true }) => {
  // L'adresse de facturation par défaut est identique à la livraison
  const billing = billingAddress ?? address;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Vérification et décrémentation du stock pour chaque article (atomique)
    for (const item of items) {
      const [rows] = await connection.execute(
        `SELECT stock, is_made_to_order FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL FOR UPDATE`,
        [item.product_id]
      );
      if (!rows[0]) {
        throw new Error(`Produit introuvable #${item.product_id}`);
      }
      // Produit sur commande : pas de contrôle ni de décrémentation de stock (fabriqué à la demande)
      if (rows[0].is_made_to_order) continue;
      if (rows[0].stock < item.quantity) {
        throw new Error(`Stock insuffisant pour le produit #${item.product_id}`);
      }
      await connection.execute(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // Création de la commande avec adresses de livraison ET de facturation figées (noms inclus)
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
         (user_id, status, subtotal, discount, coupon_code, shipping_cost, tax_amount, total, qr_reference,
          shipping_first_name, shipping_last_name,
          shipping_street, shipping_street_number, shipping_city, shipping_zip, shipping_country, shipping_canton,
          shipping_phone,
          billing_first_name, billing_last_name,
          billing_street, billing_street_number, billing_city, billing_zip, billing_country, billing_canton,
          wants_printed_invoice, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? THEN NOW() ELSE NULL END)`,
      [
        userId, status, subtotal, discount, couponCode, shippingCost, taxAmount, total, qrReference,
        address?.first_name ?? null,
        address?.last_name  ?? null,
        address?.street  ?? null,
        address?.street_number ?? null,
        address?.city    ?? null,
        address?.zip     ?? null,
        address?.country ?? 'CH',
        address?.canton  ?? null,
        // Téléphone saisi au checkout — facultatif, chaîne vide = pas de numéro
        address?.phone?.trim() || null,
        billing?.first_name ?? null,
        billing?.last_name  ?? null,
        billing?.street  ?? null,
        billing?.street_number ?? null,
        billing?.city    ?? null,
        billing?.zip     ?? null,
        billing?.country ?? 'CH',
        billing?.canton  ?? null,
        wantsPrintedInvoice ? 1 : 0,
        // Carte / Twint : simple tentative tant que le paiement n'est pas accepté (CLI-07)
        confirmed ? 1 : 0,
      ]
    );
    const orderId = orderResult.insertId;

    // Insertion des articles avec snapshot produit figé
    for (const item of items) {
      const [productRows] = await connection.execute(
        `SELECT p.price_chf, ${displayComparePriceSql('p')} AS compare_price_chf,
                p.sku, p.weight_kg, p.is_made_to_order,
                COALESCE(pt.name, pt_fr.name) AS name,
                COALESCE(pt.description, pt_fr.description) AS description
         FROM products p
         LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
         LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
         WHERE p.id = ?`,
        [locale, item.product_id]
      );
      const product = productRows[0];

      await connection.execute(
        `INSERT INTO order_items
           (order_id, product_id, variant_id, quantity, unit_price, tax_rate_snapshot, product_snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.variant_id || null,
          item.quantity,
          // Prix courant (promo appliquée si en cours), cohérent avec le sous-total
          item.unit_price,
          item.tax_rate_snapshot,
          // Snapshot figé du produit — inclut le flag « sur commande » et le prix barré au moment de l'achat
          JSON.stringify({
            name: product.name,
            sku: product.sku,
            description: product.description,
            is_made_to_order: !!product.is_made_to_order,
            compare_price_chf: product.compare_price_chf,
          }),
        ]
      );
    }

    // Historique de statut initial
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, ?, 'Commande créée', ?)`,
      [orderId, status, userId]
    );

    // Enregistrement du paiement initial — dans la même transaction
    // Provider Stripe uniquement pour les méthodes carte/Twint, sinon paiement géré en interne (facture, retrait)
    const provider = (paymentMethod === 'card' || paymentMethod === 'twint') ? 'stripe' : 'internal';
    await connection.execute(
      `INSERT INTO payments (order_id, provider, amount, currency, method, status)
       VALUES (?, ?, ?, 'CHF', ?, 'pending')`,
      [orderId, provider, total, paymentMethod]
    );

    // Incrémentation du coupon — dans la même transaction, avec re-vérification
    // de la limite d'usage sous verrou (le used_count validé plus tôt hors
    // transaction peut avoir été consommé entre-temps par une commande concurrente).
    if (couponId) {
      const [[coupon]] = await connection.execute(
        `SELECT usage_limit, used_count FROM coupons WHERE id = ? FOR UPDATE`,
        [couponId]
      );
      if (!coupon) {
        throw new AppError('Le code promo n\'est plus valide.', 409);
      }
      if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
        throw new AppError('Ce code promo a atteint sa limite d\'utilisation.', 409);
      }
      await connection.execute(
        `UPDATE coupons SET used_count = used_count + 1 WHERE id = ?`,
        [couponId]
      );
    }

    await connection.commit();
    return orderId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/* Liste des commandes d'un utilisateur — sans les tentatives de paiement carte /
   Twint non abouties (`confirmed_at` NULL, CLI-07) : la cliente ne voit que ses
   vraies commandes, pas chaque essai de carte refusé ou abandonné. */
const findByUserId = async (userId, { page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  // Jointure users + filtre deleted_at : un compte anonymisé (droit LPD) ne doit plus
  // lister ses commandes, même avec un access token encore valide ~15 min.
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.user_id = ? AND u.deleted_at IS NULL AND o.confirmed_at IS NOT NULL`,
    [userId]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.tax_amount, o.total,
            o.created_at, o.updated_at,
            COUNT(oi.id) AS items_count
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ? AND u.deleted_at IS NULL AND o.confirmed_at IS NOT NULL
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return { rows, total };
};

// Toutes les commandes d'un utilisateur avec leurs articles et leur historique —
// sans pagination, pour l'export RGPD/LPD des données personnelles.
const findAllByUserIdWithItems = async (userId) => {
  const [orders] = await pool.execute(
    `SELECT o.id, o.status, o.subtotal, o.discount, o.coupon_code,
            o.shipping_cost, o.tax_amount, o.total, o.qr_reference,
            o.created_at, o.updated_at,
            o.shipping_first_name, o.shipping_last_name, o.shipping_street, o.shipping_street_number,
            o.shipping_city, o.shipping_zip, o.shipping_country, o.shipping_canton, o.shipping_phone,
            o.billing_first_name, o.billing_last_name, o.billing_street, o.billing_street_number,
            o.billing_city, o.billing_zip, o.billing_country, o.billing_canton,
            o.wants_printed_invoice
     FROM orders o
     WHERE o.user_id = ?
     ORDER BY o.created_at ASC`,
    [userId]
  );
  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const [items] = await pool.query(
    `SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price, oi.tax_rate_snapshot,
            oi.product_snapshot_json
     FROM order_items oi
     WHERE oi.order_id IN (?)`,
    [ids]
  );
  const [history] = await pool.query(
    `SELECT order_id, status, note, created_at
     FROM order_status_history
     WHERE order_id IN (?)
     ORDER BY created_at ASC`,
    [ids]
  );

  return orders.map((o) => ({
    ...o,
    items: items
      .filter((i) => i.order_id === o.id)
      .map((i) => {
        const snap = typeof i.product_snapshot_json === 'string'
          ? JSON.parse(i.product_snapshot_json)
          : (i.product_snapshot_json || {});
        return {
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate_snapshot: i.tax_rate_snapshot,
          product_name: snap.name ?? null,
          sku: snap.sku ?? null,
        };
      }),
    status_history: history
      .filter((h) => h.order_id === o.id)
      .map((h) => ({ status: h.status, note: h.note, created_at: h.created_at })),
  }));
};

// Détail d'une commande avec ses articles
const findById = async (orderId, userId = null) => {
  const conditions = ['o.id = ?'];
  const params = [orderId];

  // Un client ne peut voir que ses propres commandes — un admin peut tout voir.
  // En contexte client on exige aussi un compte non anonymisé (droit LPD) ;
  // l'admin (userId absent) doit continuer à voir les commandes des comptes supprimés.
  if (userId) {
    conditions.push('o.user_id = ?');
    conditions.push('u.deleted_at IS NULL');
    params.push(userId);
  }

  const [orders] = await pool.execute(
    `SELECT o.id, o.status, o.subtotal, o.discount, o.coupon_code, o.shipping_cost, o.tax_amount, o.total,
            o.qr_reference, o.invoice_number, o.invoice_seq,
            o.created_at, o.updated_at, o.confirmed_at, o.user_id,
            o.shipping_first_name, o.shipping_last_name,
            o.shipping_street, o.shipping_street_number, o.shipping_city,
            o.shipping_zip, o.shipping_country, o.shipping_canton, o.shipping_phone,
            o.billing_first_name, o.billing_last_name,
            o.billing_street, o.billing_street_number, o.billing_city, o.billing_zip, o.billing_country, o.billing_canton,
            o.tracking_number, o.label_url, o.label_id,
            o.wants_printed_invoice,
            u.first_name, u.last_name, u.email
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params
  );

  if (!orders[0]) return null;

  /* sold_by_length / length_step_cm : le prix barré figé dans le snapshot est
     au mètre, le prix unitaire au tronçon — la facture en a besoin pour les
     comparer (CLI-14). */
  const [items] = await pool.execute(
    `SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity,
            oi.unit_price, oi.tax_rate_snapshot, oi.product_snapshot_json,
            p.sold_by_length, p.length_step_cm
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  const [history] = await pool.execute(
    `SELECT status, note, created_at
     FROM order_status_history
     WHERE order_id = ?
     ORDER BY created_at ASC`,
    [orderId]
  );

  // Méthode de paiement depuis la table payments
  const [payments] = await pool.execute(
    `SELECT method FROM payments WHERE order_id = ? ORDER BY created_at ASC LIMIT 1`,
    [orderId]
  );

  return {
    ...orders[0],
    payment_method: payments[0]?.method ?? null,
    items: items.map((i) => {
      const snapshot = typeof i.product_snapshot_json === 'string'
        ? JSON.parse(i.product_snapshot_json)
        : i.product_snapshot_json;
      return {
        ...i,
        product_snapshot_json: snapshot,
        // Prix normal d'un article acheté en action, à l'unité facturée (CLI-14)
        compare_unit_price: compareUnitPrice(snapshot, i),
      };
    }),
    history,
  };
};

const VALID_STATUSES = ['pending', 'awaiting_payment', 'payment_failed', 'pending_invoice', 'pending_pickup', 'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const ALLOWED_SORT   = { created_at: 'o.created_at', total: 'o.total' };

const findAllAdmin = async ({ page = 1, limit = 20, sort = 'created_at', order = 'desc', status = null, q = null, dateFrom = null, dateTo = null, attempts = false } = {}) => {
  const offset    = (page - 1) * limit;
  const sortField = ALLOWED_SORT[sort] || 'o.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const params = [];
  /* CLI-07 — une commande carte / Twint n'existe pour la boutique qu'une fois
     payée. Les tentatives non abouties (en attente, refusées, abandonnées) ne
     figurent que dans la vue « Paiements non aboutis » (`attempts`), utile
     quand une cliente appelle au sujet d'une carte refusée. */
  const conditions = [attempts ? 'o.confirmed_at IS NULL' : 'o.confirmed_at IS NOT NULL'];

  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s));
    if (statuses.length === 1) {
      conditions.push('o.status = ?');
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`o.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (q) {
    if (/^\d+$/.test(q)) {
      conditions.push('o.id = ?');
      params.push(parseInt(q));
    } else if (/^\d{4}-\d+$/.test(q)) {
      /* Numéro de facture (« 2026-000001 ») : c'est la référence que la cliente a
         sous les yeux quand elle appelle, et elle ne trouvait rien — le format
         n'est ni un entier pur ni un nom. Comparaison exacte, et repli LIKE pour
         une saisie sans les zéros de tête (« 2026-1 »). */
      conditions.push('(o.invoice_number = ? OR o.invoice_number LIKE ?)');
      const [year, seq] = q.split('-');
      params.push(q, `${year}-%${parseInt(seq, 10)}`);
    } else {
      conditions.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR o.invoice_number LIKE ? OR o.tracking_number LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
  }

  /* Période — sert au point comptable (TVA trimestrielle) : on borne sur la
     journée entière, une date de fin au format AAAA-MM-JJ devant inclure les
     commandes passées ce jour-là. */
  if (dateFrom) {
    conditions.push('o.created_at >= ?');
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    conditions.push('o.created_at <= ?');
    params.push(`${dateTo} 23:59:59`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o INNER JOIN users u ON u.id = o.user_id ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.tax_amount, o.total,
            o.created_at, o.updated_at, o.wants_printed_invoice,
            o.invoice_number, o.tracking_number,
            u.email, u.first_name, u.last_name
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
};

// Change le statut d'une commande + trace dans l'historique — transaction atomique.
// Retourne false si la commande n'existe pas.
// Statuts à partir desquels le stock a été décrémenté et doit donc être restitué
// si la commande est annulée/remboursée. Une commande déjà `cancelled`/`refunded`
// a déjà rendu son stock : repasser de l'un à l'autre ne doit pas le rendre deux fois.
const STOCK_HELD_STATUSES = [
  'pending', 'awaiting_payment', 'payment_failed', 'pending_invoice', 'pending_pickup',
  'ready_for_pickup', 'paid', 'processing', 'shipped', 'delivered',
];
const STOCK_RELEASING_STATUSES = ['cancelled', 'refunded'];
// Statuts qui ne confirment pas une tentative de paiement en ligne (voir confirmed_at)
const UNCONFIRMING_STATUSES = ['pending', 'awaiting_payment', 'payment_failed', 'cancelled'];

// Change le statut d'une commande + trace l'historique. Restitue le stock de façon
// atomique quand la commande bascule vers `cancelled`/`refunded` (le stock est
// décrémenté dès la création — sans cette contrepartie, un impayé le retire à vie).
// Retourne { ok, previousStatus, stockRestored } — previousStatus permet à l'appelant
// de savoir d'où vient la commande (l'objet relu après coup porte déjà le nouveau statut).
const updateStatusWithHistory = async (orderId, status, note, createdBy) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // FOR UPDATE : deux changements de statut concurrents ne doivent pas tous deux
    // conclure « la commande n'était pas encore annulée » et restituer le stock chacun.
    const [[existing]] = await connection.execute(
      `SELECT id, status FROM orders WHERE id = ? LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    if (!existing) {
      await connection.rollback();
      return { ok: false, previousStatus: null, stockRestored: false };
    }

    const previousStatus = existing.status;
    const shouldRestoreStock =
      STOCK_RELEASING_STATUSES.includes(status) &&
      STOCK_HELD_STATUSES.includes(previousStatus);

    if (shouldRestoreStock) {
      // Les produits « sur commande » n'ont jamais été décrémentés (voir createOrder) :
      // les ré-incrémenter gonflerait artificiellement leur stock.
      await connection.execute(
        `UPDATE products p
           INNER JOIN order_items oi ON oi.product_id = p.id
           SET p.stock = p.stock + oi.quantity
         WHERE oi.order_id = ? AND p.is_made_to_order = 0`,
        [orderId]
      );
    }

    /* Une tentative carte / Twint que la boutique fait avancer à la main (réglée
       autrement, préparée, expédiée…) devient une vraie commande (CLI-07). */
    await connection.execute(
      `UPDATE orders SET status = ?,
         confirmed_at = CASE WHEN ? THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END
       WHERE id = ?`,
      [status, UNCONFIRMING_STATUSES.includes(status) ? 0 : 1, orderId]
    );
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, ?, ?, ?)`,
      [orderId, status, note || null, createdBy ?? null]
    );

    await connection.commit();
    return { ok: true, previousStatus, stockRestored: shouldRestoreStock };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// Enregistre le numéro de suivi + les infos d'étiquette d'une commande
const saveShippingLabel = async (orderId, { trackingNumber, labelUrl = null, labelId = null }) => {
  const [result] = await pool.execute(
    `UPDATE orders SET tracking_number = ?, label_url = ?, label_id = ? WHERE id = ?`,
    [trackingNumber, labelUrl, labelId, orderId]
  );
  return result.affectedRows > 0;
};

// Met à jour uniquement le numéro de suivi (saisie manuelle admin)
const updateTrackingNumber = async (orderId, trackingNumber) => {
  const [result] = await pool.execute(
    `UPDATE orders SET tracking_number = ? WHERE id = ?`,
    [trackingNumber, orderId]
  );
  return result.affectedRows > 0;
};

// Passe une commande à "paid" si elle ne l'est pas déjà + met à jour le paiement.
// Utilisé par le webhook Stripe. Retourne { statusChanged }.
/* Statuts depuis lesquels une commande peut légitimement passer à « payée ».
   Une commande annulée ou remboursée a rendu son stock : la marquer payée
   laisserait Julie avec une commande à honorer dont les articles sont retournés
   en rayon. Une commande déjà expédiée ou livrée n'a plus à changer d'état. */
const PAYABLE_STATUSES = ['pending', 'awaiting_payment', 'payment_failed', 'pending_invoice'];

const markPaidFromWebhook = async (orderId, providerPaymentId, method) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    /* Le passage à « payée » n'est autorisé que depuis un statut en attente de
       paiement. `status != 'paid'` seul laissait une commande ANNULÉE devenir
       payée — le cas se produit quand une cliente paie un lien Twint reçu par
       e-mail après que la commande a été annulée. */
    // Le paiement accepté fait d'une tentative carte / Twint une vraie commande (CLI-07)
    const [upd] = await connection.execute(
      `UPDATE orders SET status = 'paid', confirmed_at = COALESCE(confirmed_at, NOW())
       WHERE id = ? AND status IN (${PAYABLE_STATUSES.map(() => '?').join(', ')})`,
      [orderId, ...PAYABLE_STATUSES]
    );
    const statusChanged = upd.affectedRows > 0;

    if (statusChanged) {
      await connection.execute(
        `INSERT INTO order_status_history (order_id, status, note, created_by)
         VALUES (?, 'paid', 'Paiement Stripe confirmé', NULL)`,
        [orderId]
      );
    }

    await connection.execute(
      `UPDATE payments SET status = 'succeeded', provider_payment_id = ?
       WHERE order_id = ? AND method = ?`,
      [providerPaymentId, orderId, method]
    );

    await connection.commit();
    return { statusChanged };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// Verrouille la commande (FOR UPDATE) le temps de vérifier qu'aucune création de
// PaymentIntent n'est déjà en cours pour cette méthode — ferme la fenêtre de course
// entre deux appels concurrents à createCardIntent/createTwintIntent (double-clic,
// deux onglets) qui liraient tous deux un statut "payable" avant que l'un des deux
// n'ait eu le temps d'écrire quoi que ce soit. Le verrou ne couvre que cette
// vérification courte, jamais l'appel réseau Stripe qui suit (relâché avant).
// Fenêtre de "création en cours" : 30s, au-delà on considère l'appel précédent
// comme abandonné (timeout réseau, onglet fermé) et on autorise un nouvel essai.
const IN_FLIGHT_WINDOW_SECONDS = 30;

const lockOrderForPaymentIntent = async (orderId, userId, method) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const conditions = ['id = ?'];
    const params = [orderId];
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    const [orders] = await connection.execute(
      `SELECT id, status, total FROM orders WHERE ${conditions.join(' AND ')} FOR UPDATE`,
      params
    );
    const order = orders[0];
    if (!order) {
      throw new AppError('Commande introuvable.', 404);
    }
    // `payment_failed` : la cliente réessaie après un refus de sa banque
    if (!['pending', 'awaiting_payment', 'payment_failed'].includes(order.status)) {
      throw new AppError('Cette commande ne peut pas être payée.', 400);
    }

    /* Une création de PaymentIntent pour cette méthode est déjà en cours (< 30s) —
       la requête concurrente s'arrête ici plutôt que de créer un second PaymentIntent.

       `provider_payment_id IS NULL` est essentiel : seule une réservation qui
       n'a PAS encore abouti bloque. Sans cette condition, une personne qui
       recharge sa page de paiement dans les 30 secondes se heurtait à un 409
       alors que son paiement était déjà prêt côté Stripe — l'écran restait vide
       et aucune nouvelle tentative ne passait. Une réservation déjà complétée
       est au contraire réutilisable : c'est le même paiement. */
    /* La PREMIÈRE ligne `payments` de la commande n'est pas une réservation :
       createOrder l'enregistre pour mémoriser le moyen de paiement choisi, en
       attente et sans identifiant Stripe. Comptée comme « demande en cours », elle
       faisait refuser en 409 la toute première demande de paiement — toujours
       faite dans les 30 s qui suivent la commande. Le formulaire de carte ne
       s'ouvrait jamais, et la commande restait créée sans paiement. */
    const [inFlight] = await connection.execute(
      `SELECT id FROM payments
       WHERE order_id = ? AND method = ? AND status = 'pending'
         AND provider_payment_id IS NULL
         AND created_at > (NOW() - INTERVAL ? SECOND)
         AND id > (SELECT MIN(p0.id) FROM payments p0 WHERE p0.order_id = ?)
       LIMIT 1`,
      [orderId, method, IN_FLIGHT_WINDOW_SECONDS, orderId]
    );
    if (inFlight[0]) {
      throw new AppError('Une demande de paiement est déjà en cours pour cette commande.', 409);
    }

    // Réserve la fenêtre : la ligne payments est créée ici (provider_payment_id
    // encore NULL), avant l'appel Stripe — updateStatusByOrder la complétera ensuite.
    const [result] = await connection.execute(
      `INSERT INTO payments (order_id, provider, amount, currency, method, status)
       VALUES (?, 'stripe', ?, 'CHF', ?, 'pending')`,
      [orderId, order.total ?? 0, method]
    );

    await connection.commit();
    return { order, paymentId: result.insertId };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/* Attribue son numéro de facture à une commande, à la première émission.
   Le compteur est annuel (« 2026-000001 ») et repart à 1 le 1er janvier :
   la période est l'année civile, donc 2027 recommence à « 2027-000001 »
   sans aucune intervention.

   Atomicité : INSERT ... ON DUPLICATE KEY UPDATE incrémente la ligne de l'année
   sous verrou de la transaction, donc deux commandes simultanées ne peuvent pas
   obtenir le même numéro — un doublon de numéro de facture serait une faute
   comptable, pas un simple défaut d'affichage.

   Idempotence : si la commande a déjà un numéro, on le renvoie sans rien
   consommer. Régénérer un PDF ne doit jamais changer le numéro ni créer de trou
   dans la séquence. */
const assignInvoiceNumber = async (orderId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.execute(
      `SELECT invoice_number, invoice_seq FROM orders WHERE id = ? FOR UPDATE`,
      [orderId]
    );
    if (!existing) {
      await connection.rollback();
      return null;
    }
    if (existing.invoice_number) {
      await connection.commit();
      // L'année provient du numéro déjà figé (« 2026-000001 »), pas de l'horloge :
      // régénérer en 2027 une facture de 2026 doit redonner la même référence QR.
      const existingYear = parseInt(String(existing.invoice_number).slice(0, 4), 10);
      return {
        invoiceNumber: existing.invoice_number,
        invoiceSeq:    existing.invoice_seq,
        year:          Number.isInteger(existingYear) ? existingYear : new Date().getFullYear(),
      };
    }

    // Période = année civile courante (« 2026 »), d'où la remise à zéro au 1er janvier
    const period = String(new Date().getFullYear());

    await connection.execute(
      `INSERT INTO invoice_counters (period, last_seq) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
      [period]
    );
    const [[counter]] = await connection.execute(
      `SELECT last_seq FROM invoice_counters WHERE period = ?`,
      [period]
    );

    // Format demandé par la cliente : année + 6 chiffres, ex. « 2026-000001 »
    const seq           = counter.last_seq;
    const invoiceNumber = `${period}-${String(seq).padStart(6, '0')}`;

    await connection.execute(
      `UPDATE orders SET invoice_number = ?, invoice_seq = ? WHERE id = ?`,
      [invoiceNumber, seq, orderId]
    );

    await connection.commit();
    return { invoiceNumber, invoiceSeq: seq, year: Number(period) };
  } catch (err) {
    try { await connection.rollback(); } catch { /* connexion déjà rendue */ }
    throw err;
  } finally {
    connection.release();
  }
};

// Référence QR — écrite au moment où la facture reçoit son numéro
const saveQrReference = async (orderId, reference) => {
  const [result] = await pool.execute(
    `UPDATE orders SET qr_reference = ? WHERE id = ?`,
    [reference, orderId]
  );
  return result.affectedRows > 0;
};

/* ─────────────────────────────────────────────────────────────
   Commandes carte / Twint impayées (CLI-07)

   Une commande par carte ou Twint est créée AVANT le paiement : le stock est
   réservé et la cliente est envoyée sur le formulaire Stripe. Si la banque
   refuse, ou si la cliente abandonne, la commande ne doit ni encombrer la liste
   « À traiter » ni garder le stock indéfiniment.

   Une commande est « en ligne impayée » quand son PREMIER paiement (le moyen
   choisi au checkout, cf. findById) est carte ou Twint, qu'elle attend encore
   son paiement et qu'aucun paiement n'a abouti. `pending` couvre les commandes
   créées avant ce correctif, qui naissaient à ce statut.
   ───────────────────────────────────────────────────────────── */
const UNPAID_ONLINE_STATUSES = ['pending', 'awaiting_payment', 'payment_failed'];

const unpaidOnlineConditionSql = `
  o.status IN ('pending', 'awaiting_payment', 'payment_failed')
  AND (SELECT p1.method FROM payments p1 WHERE p1.order_id = o.id
       ORDER BY p1.created_at ASC, p1.id ASC LIMIT 1) IN ('card', 'twint')
  AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = o.id
                  AND p2.status IN ('succeeded', 'processing'))`;

/* Commandes en ligne impayées plus anciennes que `maxAgeMinutes`.
   Un QR Twint envoyé par e-mail depuis l'admin est valable 24 h : la commande
   concernée n'est pas expirée tant que ce QR peut encore être payé. */
const findExpiredUnpaidOnlineOrderIds = async (maxAgeMinutes, limit = 50) => {
  const [rows] = await pool.query(
    `SELECT o.id FROM orders o
     WHERE ${unpaidOnlineConditionSql}
       AND o.created_at < (NOW() - INTERVAL ? MINUTE)
       AND NOT EXISTS (SELECT 1 FROM payments p3 WHERE p3.order_id = o.id
                       AND p3.provider = 'stripe_qr_email'
                       AND p3.created_at > (NOW() - INTERVAL 24 HOUR))
     ORDER BY o.id ASC
     LIMIT ?`,
    [maxAgeMinutes, limit]
  );
  return rows.map((r) => r.id);
};

// Commandes en ligne impayées d'une cliente — libérées quand elle en passe une nouvelle
const findUnpaidOnlineOrderIdsByUser = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT o.id FROM orders o
     WHERE o.user_id = ? AND ${unpaidOnlineConditionSql}
     ORDER BY o.id ASC
     LIMIT 20`,
    [userId]
  );
  return rows.map((r) => r.id);
};

/* Annule une commande en ligne impayée et rend tout ce qu'elle retenait :
   stock, utilisation du code promo, bon de fidélité. Une seule transaction —
   une annulation à moitié faite laisserait par exemple le stock rendu mais le
   code promo toujours décompté.

   Re-vérifie sous verrou que la commande est toujours impayée : le webhook
   Stripe a pu la passer à « payée » entre la sélection et l'annulation.
   Retourne { cancelled, items } — les articles servent à remplir de nouveau le
   panier de la cliente. */
const cancelUnpaidOnlineOrder = async (orderId, note) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[order]] = await connection.execute(
      `SELECT o.id, o.user_id, o.status, o.coupon_code FROM orders o
       WHERE o.id = ? AND ${unpaidOnlineConditionSql}
       FOR UPDATE`,
      [orderId]
    );
    if (!order) {
      await connection.rollback();
      return { cancelled: false, items: [] };
    }

    const [items] = await connection.execute(
      `SELECT product_id, variant_id, quantity, unit_price, tax_rate_snapshot
       FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    // Stock — les produits « sur commande » n'ont jamais été décrémentés
    await connection.execute(
      `UPDATE products p
         INNER JOIN order_items oi ON oi.product_id = p.id
         SET p.stock = p.stock + oi.quantity
       WHERE oi.order_id = ? AND p.is_made_to_order = 0`,
      [orderId]
    );

    if (order.coupon_code) {
      // Code promo : l'utilisation comptée à la création est rendue
      await connection.execute(
        `UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = ?`,
        [order.coupon_code]
      );
      // Bon de fidélité : redevient utilisable s'il n'a pas expiré entre-temps
      const [reward] = await connection.execute(
        `UPDATE loyalty_rewards SET status = 'available'
         WHERE user_id = ? AND code = ? AND status = 'used'
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [order.user_id, order.coupon_code]
      );
      if (reward.affectedRows > 0) {
        await connection.execute(
          `DELETE FROM loyalty_transactions WHERE order_id = ? AND type = 'redeem'`,
          [orderId]
        );
      }
    }

    await connection.execute(
      `UPDATE payments SET status = 'cancelled'
       WHERE order_id = ? AND status IN ('pending', 'failed')`,
      [orderId]
    );
    await connection.execute(`UPDATE orders SET status = 'cancelled' WHERE id = ?`, [orderId]);
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, note, created_by)
       VALUES (?, 'cancelled', ?, NULL)`,
      [orderId, note]
    );

    await connection.commit();
    return { cancelled: true, items };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/* Refus de paiement signalé par Stripe : la commande passe à « Paiement refusé ».
   Un nouveau refus (la cliente réessaie avec une autre carte) ajoute seulement
   une ligne d'historique. Une commande déjà payée ou annulée n'est pas touchée —
   les webhooks Stripe peuvent arriver dans le désordre. */
const markPaymentFailed = async (orderId, note) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[order]] = await connection.execute(
      `SELECT status FROM orders WHERE id = ? FOR UPDATE`,
      [orderId]
    );
    if (!order || !UNPAID_ONLINE_STATUSES.includes(order.status)) {
      await connection.rollback();
      return false;
    }

    if (order.status !== 'payment_failed') {
      await connection.execute(
        `UPDATE orders SET status = 'payment_failed' WHERE id = ?`,
        [orderId]
      );
    }

    /* Un même refus est signalé deux fois : par le site, dès le retour de la
       cliente, puis par le webhook Stripe. Le second ne doit pas doubler la
       ligne d'historique — même motif dans les 5 dernières minutes. */
    const [[last]] = await connection.execute(
      `SELECT status, note, created_at > (NOW() - INTERVAL 5 MINUTE) AS is_recent
       FROM order_status_history WHERE order_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [orderId]
    );
    const alreadyLogged = last?.status === 'payment_failed' && last.note === note && Number(last.is_recent) === 1;

    if (!alreadyLogged) {
      await connection.execute(
        `INSERT INTO order_status_history (order_id, status, note, created_by)
         VALUES (?, 'payment_failed', ?, NULL)`,
        [orderId, note]
      );
    }

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = {
  createOrder, findByUserId, findAllByUserIdWithItems, findById, findAllAdmin,
  updateStatusWithHistory, saveShippingLabel, updateTrackingNumber, markPaidFromWebhook,
  lockOrderForPaymentIntent, assignInvoiceNumber, saveQrReference,
  UNPAID_ONLINE_STATUSES, findExpiredUnpaidOnlineOrderIds, findUnpaidOnlineOrderIdsByUser,
  cancelUnpaidOnlineOrder, markPaymentFailed,
};
