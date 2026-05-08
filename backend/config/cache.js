const NodeCache = require('node-cache');

// TTL en secondes par type de données (voir CLAUDE.md section performance)
const TTL = {
  PRODUCTS: 300,      // 5 minutes — catalogue produits
  PRODUCT: 300,       // 5 minutes — détail produit
  CATEGORIES: 1800,   // 30 minutes — catégories
  TAX_RATES: 86400,   // 24 heures — taux TVA
  SHIPPING: 86400,    // 24 heures — frais de port
};

const cache = new NodeCache({
  stdTTL: TTL.PRODUCTS,
  checkperiod: 60,
  useClones: false,
});

// Génération des clés de cache incluant la locale
const keys = {
  productsList: (locale, page, limit, filters = '') =>
    `products:list:${locale}:${page}:${limit}:${filters}`,
  product: (id, locale) => `product:${id}:${locale}`,
  categories: (locale) => `categories:${locale}`,
  taxRates: () => 'tax_rates',
  shippingRates: () => 'shipping_rates',
};

// Invalidation du cache produit (appelée après chaque modification admin)
const invalidateProducts = () => {
  const productKeys = cache.keys().filter((k) => k.startsWith('product'));
  cache.del(productKeys);
};

module.exports = { cache, TTL, keys, invalidateProducts };
