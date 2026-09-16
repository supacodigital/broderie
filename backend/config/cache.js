const NodeCache = require('node-cache');

// TTL en secondes par type de données (voir CLAUDE.md section performance)
const TTL = {
  PRODUCTS: 300,      // 5 minutes — catalogue produits
  PRODUCT: 300,       // 5 minutes — détail produit
  CATEGORIES: 1800,   // 30 minutes — catégories (et marques du catalogue)
  TAX_RATES: 86400,   // 24 heures — taux TVA
  SHIPPING: 86400,    // 24 heures — frais de port
};

/* maxKeys borne le cache : chaque recherche distincte crée une entrée d'environ 20 Ko
   (20 fiches produit complètes) conservée 5 minutes. Sans plafond, la barre de
   recherche alimente le cache indéfiniment — un terme saisi au clavier génère
   plusieurs entrées (suggestions + grille, à des `limit` différents), et aucune
   n'est jamais réutilisée. En production le process atteignait la limite
   max_memory_restart de PM2 (500 Mo, voir ecosystem.config.js) et était tué :
   c'est le « crash » observé depuis la boutique.
   2000 entrées ≈ 40 Mo au pire, ce qui laisse une marge confortable.
   `deleteOnExpire` + `checkperiod` assurent la purge des entrées périmées, et
   NodeCache évince en erreur au-delà du plafond — d'où le try/catch de cacheSet. */
const MAX_KEYS = 2000;

const cache = new NodeCache({
  stdTTL: TTL.PRODUCTS,
  checkperiod: 60,
  useClones: false,
  maxKeys: MAX_KEYS,
  deleteOnExpire: true,
});

/* Écriture tolérante : au-delà de maxKeys, NodeCache lève une ECACHEFULL.
   Le cache est une optimisation, jamais une condition de succès de la requête —
   on sert la réponse sans la mémoriser plutôt que de renvoyer une erreur 500.
   Avant d'abandonner, on purge les entrées de liste produits (les plus nombreuses
   et les moins réutilisées) pour laisser la place aux suivantes. */
const cacheSet = (key, value, ttl) => {
  try {
    cache.set(key, value, ttl);
  } catch {
    try {
      cache.del(cache.keys().filter((k) => k.startsWith('products:list:')));
      cache.set(key, value, ttl);
    } catch {
      // Cache plein malgré la purge — la réponse est servie sans mise en cache
    }
  }
};

// Génération des clés de cache incluant la locale
const keys = {
  productsList: (locale, page, limit, filters = '') =>
    `products:list:${locale}:${page}:${limit}:${filters}`,
  product: (id, locale) => `product:${id}:${locale}`,
  categories: (locale) => `categories:${locale}`,
  brands: () => 'products:brands',
  taxRates: () => 'tax_rates',
  shippingRates: () => 'shipping_rates',
};

// Invalidation du cache produit (appelée après chaque modification admin)
const invalidateProducts = () => {
  const productKeys = cache.keys().filter((k) => k.startsWith('product'));
  cache.del(productKeys);
};

module.exports = { cache, cacheSet, TTL, keys, invalidateProducts };
