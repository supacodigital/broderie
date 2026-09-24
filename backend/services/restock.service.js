const restockRepository = require('../repositories/restock.repository');
const { AppError } = require('../middlewares/errorHandler');
const { buildCsv } = require('../utils/csv.utils');

/* État des réassorts fournisseurs (ADM-09) — mise en forme des données du
   dépôt : synthèse par fournisseur, liste à commander, export CSV. */

// Identifiant de la rubrique « sans fournisseur » dans l'URL
const NO_SUPPLIER = 'sans-fournisseur';

const parseSupplierId = (raw) => {
  if (raw === NO_SUPPLIER) return null;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Fournisseur invalide.', 400);
  return id;
};

/* Synthèse : un fournisseur par ligne, les plus urgents en tête (articles
   attendus par des clientes, puis stock bas). */
const getSummary = async () => {
  const { demand, low, suppliers } = await restockRepository.summaryBySupplier();
  const byId = new Map();
  const entry = (supplierId) => {
    const key = supplierId ?? NO_SUPPLIER;
    if (!byId.has(key)) {
      const s = suppliers.find((x) => x.id === supplierId);
      byId.set(key, {
        supplierId: supplierId ?? NO_SUPPLIER,
        name: supplierId === null ? 'Sans fournisseur' : (s?.name ?? `Fournisseur n° ${supplierId}`),
        demandItems: 0,
        demandQty: 0,
        lowStockItems: 0,
      });
    }
    return byId.get(key);
  };
  for (const d of demand) {
    const e = entry(d.supplier_id);
    e.demandItems = Number(d.demand_items);
    e.demandQty = Number(d.demand_qty);
  }
  for (const l of low) entry(l.supplier_id).lowStockItems = Number(l.low_stock_items);

  return [...byId.values()].sort((a, b) =>
    b.demandItems - a.demandItems || b.lowStockItems - a.lowStockItems || a.name.localeCompare(b.name, 'fr'));
};

/* Liste à commander chez un fournisseur : une ligne par article, qu'il soit
   demandé par des commandes, en stock bas, ou les deux. */
const getSupplierItems = async (rawSupplierId) => {
  const supplierId = parseSupplierId(rawSupplierId);
  const supplier = supplierId === null
    ? { id: NO_SUPPLIER, name: 'Sans fournisseur' }
    : await restockRepository.findSupplierContact(supplierId);
  if (!supplier) throw new AppError('Fournisseur introuvable.', 404);

  const { demand, low, products, truncated } = await restockRepository.itemsForSupplier(supplierId);
  const productById = new Map(products.map((p) => [p.id, p]));
  const lowIds = new Set(low.map((l) => l.product_id));

  const line = (productId) => {
    const p = productById.get(productId) ?? {};
    return {
      productId,
      name: p.name ?? `Article n° ${productId}`,
      sku: p.sku ?? null,
      stock: p.stock ?? 0,
      madeToOrder: !!p.is_made_to_order,
      orderedQty: 0,
      orderIds: [],
      firstOrderAt: null,
      lowStock: lowIds.has(productId),
    };
  };

  const items = demand.map((d) => ({
    ...line(d.product_id),
    orderedQty: Number(d.ordered_qty),
    orderIds: String(d.order_ids ?? '').split(',').filter(Boolean).map(Number),
    firstOrderAt: d.first_order_at,
  }));
  const inDemand = new Set(items.map((i) => i.productId));
  for (const l of low) if (!inDemand.has(l.product_id)) items.push(line(l.product_id));

  return {
    supplier,
    threshold: restockRepository.LOW_STOCK_THRESHOLD,
    items,
    truncated,
  };
};

// Export CSV de la liste d'un fournisseur — à joindre à la commande
const buildSupplierCsv = async (rawSupplierId) => {
  const { supplier, items } = await getSupplierItems(rawSupplierId);
  const headers = ['Référence', 'Article', 'Quantité commandée par des clientes', 'Commandes', 'Stock boutique', 'Motif'];
  const rows = items.map((i) => [
    i.sku ?? '',
    i.name,
    i.orderedQty || '',
    i.orderIds.map((id) => `#${id}`).join(' '),
    i.stock,
    [i.orderedQty ? 'Commande cliente' : null, i.lowStock ? 'Stock bas' : null].filter(Boolean).join(' + '),
  ]);
  const safeName = String(supplier.name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'fournisseur';
  return { filename: `reassort-${safeName}.csv`, csv: buildCsv(headers, rows) };
};

module.exports = { getSummary, getSupplierItems, buildSupplierCsv, NO_SUPPLIER };
