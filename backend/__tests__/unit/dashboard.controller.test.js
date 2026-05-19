// Tests unitaires admin/dashboard.controller

jest.mock('../../repositories/dashboard.repository', () => ({
  getStats:       jest.fn(),
  getChart:       jest.fn(),
  getTopProducts: jest.fn(),
  getLowStock:    jest.fn(),
  getRecentOrders: jest.fn(),
}));

const dashboardRepository = require('../../repositories/dashboard.repository');
const { getStats }        = require('../../controllers/admin/dashboard.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

function setupMocks({
  caRows = { revenue_month: '1000', revenue_prev: '800', orders_week: 10, orders_prev_week: 8, orders_pending: 2, customers_new: 5, customers_prev: 3, rating_avg: '4.5', rating_pending: 1 },
  chartRows = [],
  topRows = [],
  lowStockRows = [],
  recentOrders = [],
} = {}) {
  dashboardRepository.getStats.mockResolvedValue({ caRows, ordersRows: caRows, custRows: caRows, reviewRows: caRows });
  dashboardRepository.getChart.mockResolvedValue(chartRows);
  dashboardRepository.getTopProducts.mockResolvedValue(topRows);
  dashboardRepository.getLowStock.mockResolvedValue(lowStockRows);
  dashboardRepository.getRecentOrders.mockResolvedValue(recentOrders);
}

describe('admin/dashboard.controller — getStats()', () => {
  test('retourne les KPIs avec tendances calculées', async () => {
    setupMocks({
      caRows: {
        revenue_month: '1000', revenue_prev: '800',
        orders_week: 10, orders_prev_week: 8, orders_pending: 2,
        customers_new: 6, customers_prev: 4,
        rating_avg: '4.5', rating_pending: 3,
      },
    });

    const req = {};
    const res = makeRes();
    const next = jest.fn();

    await getStats(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.stats.revenue_month).toBe(1000);
    // tendance : (1000 - 800) / 800 * 100 = 25%
    expect(body.data.stats.revenue_trend).toBe(25);
    // tendance commandes : (10 - 8) / 8 * 100 = 25%
    expect(body.data.stats.orders_trend).toBe(25);
    expect(body.data.stats.rating_avg).toBe(4.5);
    expect(body.data.stats.rating_pending).toBe(3);
  });

  test('retourne null pour la tendance si revenu précédent = 0', async () => {
    setupMocks({
      caRows: {
        revenue_month: '500', revenue_prev: '0',
        orders_week: 5, orders_prev_week: 0, orders_pending: 0,
        customers_new: 2, customers_prev: 0,
        rating_avg: '0', rating_pending: 0,
      },
    });

    const req = {};
    const res = makeRes();
    await getStats(req, res, jest.fn());

    const { stats } = res.json.mock.calls[0][0].data;
    expect(stats.revenue_trend).toBeNull();
    expect(stats.orders_trend).toBeNull();
    expect(stats.customers_trend).toBeNull();
  });

  test('transforme correctement le graphique avec pct et current', async () => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    setupMocks({
      chartRows: [
        { month_label: 'Jan', revenue: '200', month_key: '2026-01' },
        { month_label: 'Mois actuel', revenue: '400', month_key: currentKey },
      ],
    });

    const req = {};
    const res = makeRes();
    await getStats(req, res, jest.fn());

    const { chart } = res.json.mock.calls[0][0].data;
    expect(chart).toHaveLength(2);
    expect(chart[1].current).toBe(true);
    expect(chart[0].current).toBe(false);
    // pct max = 400 → 100%, 200 → 50%
    expect(chart[1].pct).toBe(100);
    expect(chart[0].pct).toBe(50);
  });

  test('transforme correctement les produits top', async () => {
    setupMocks({
      topRows: [
        { id: 1, name: 'Fil DMC', category_name: 'Fils', revenue: '500', image_url: 'img.webp' },
        { id: 2, name: null,      category_name: null,   revenue: '250', image_url: null },
      ],
    });

    const req = {};
    const res = makeRes();
    await getStats(req, res, jest.fn());

    const { top_products } = res.json.mock.calls[0][0].data;
    expect(top_products[0].pct).toBe(100);
    expect(top_products[1].pct).toBe(50);
    expect(top_products[1].name).toBe('Produit #2');
    expect(top_products[1].category).toBe('—');
  });

  test('transforme les low stock avec le flag urgent (stock <= 2)', async () => {
    setupMocks({
      lowStockRows: [
        { id: 1, name: 'Fil', stock: 1, image_url: null },
        { id: 2, name: 'Aiguille', stock: 4, image_url: null },
      ],
    });

    const req = {};
    const res = makeRes();
    await getStats(req, res, jest.fn());

    const { low_stock } = res.json.mock.calls[0][0].data;
    expect(low_stock[0].urgent).toBe(true);
    expect(low_stock[1].urgent).toBe(false);
  });

  test('transforme les commandes récentes', async () => {
    setupMocks({
      recentOrders: [
        { id: 10, first_name: 'Jean', last_name: 'Dupont', email: 'j@b.ch', status: 'paid', total: '58.40', created_at: '2026-01-01' },
        { id: 11, first_name: null,   last_name: null,      email: null,      status: 'pending', total: null, created_at: '2026-01-02' },
      ],
    });

    const req = {};
    const res = makeRes();
    await getStats(req, res, jest.fn());

    const orders = res.json.mock.calls[0][0].data.recent_orders;
    expect(orders[0].customer_name).toBe('Jean Dupont');
    expect(orders[0].total).toBe(58.4);
    expect(orders[1].customer_name).toBe('—');
    expect(orders[1].total).toBe(0);
    expect(orders[1].customer_email).toBe('');
  });

  test('appelle next en cas d\'erreur', async () => {
    dashboardRepository.getStats.mockRejectedValue(new Error('DB'));
    dashboardRepository.getChart.mockResolvedValue([]);
    dashboardRepository.getTopProducts.mockResolvedValue([]);
    dashboardRepository.getLowStock.mockResolvedValue([]);
    dashboardRepository.getRecentOrders.mockResolvedValue([]);

    const req = {};
    const res = makeRes();
    const next = jest.fn();
    await getStats(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
