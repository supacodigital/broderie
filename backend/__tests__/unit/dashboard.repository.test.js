// Tests unitaires dashboard.repository — pool mocké, aucune BDD requise

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool }                = require('../../config/db');
const dashboardRepository     = require('../../repositories/dashboard.repository');

beforeEach(() => jest.clearAllMocks());

// ── getStats() ────────────────────────────────────────────────────────────────

describe('dashboard.repository — getStats()', () => {
  function mockStats() {
    pool.execute
      .mockResolvedValueOnce([[{ revenue_month: '1200.00', revenue_prev: '900.00' }]])  // CA
      .mockResolvedValueOnce([[{ orders_week: 8, orders_prev_week: 5, orders_pending: 2 }]])
      .mockResolvedValueOnce([[{ customers_new: 3, customers_prev: 2 }]])
      .mockResolvedValueOnce([[{ rating_avg: '4.5', rating_pending: 1 }]]);
  }

  test('retourne les 4 blocs de stats', async () => {
    mockStats();
    const result = await dashboardRepository.getStats({ month: 5, year: 2026 });
    expect(result.caRows.revenue_month).toBe('1200.00');
    expect(result.ordersRows.orders_week).toBe(8);
    expect(result.custRows.customers_new).toBe(3);
    expect(result.reviewRows.rating_avg).toBe('4.5');
    expect(pool.execute).toHaveBeenCalledTimes(4);
  });

  test('gère le passage de décembre à janvier (month=1)', async () => {
    mockStats();
    await dashboardRepository.getStats({ month: 1, year: 2026 });
    // Vérifie que le mois précédent est décembre de l'année précédente
    const firstCall = pool.execute.mock.calls[0];
    const params    = firstCall[1];
    expect(params[2]).toBe(12);     // mois précédent = décembre
    expect(params[3]).toBe(2025);   // année précédente
  });

  test('calcule mois - 1 pour les autres mois', async () => {
    mockStats();
    await dashboardRepository.getStats({ month: 5, year: 2026 });
    const params = pool.execute.mock.calls[0][1];
    expect(params[2]).toBe(4);    // mois précédent = avril
    expect(params[3]).toBe(2026); // même année
  });
});

// ── getChart() ────────────────────────────────────────────────────────────────

describe('dashboard.repository — getChart()', () => {
  test('retourne les 7 derniers mois de CA', async () => {
    const fakeChart = [
      { month_key: '2026-01', month_label: 'Jan', revenue: '800.00' },
      { month_key: '2026-02', month_label: 'Feb', revenue: '950.00' },
    ];
    pool.execute.mockResolvedValue([fakeChart]);
    const result = await dashboardRepository.getChart();
    expect(result).toEqual(fakeChart);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INTERVAL 7 MONTH')
    );
  });

  test('exclut les commandes annulées/remboursées', async () => {
    pool.execute.mockResolvedValue([[]]);
    await dashboardRepository.getChart();
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN ('cancelled','refunded')")
    );
  });
});

// ── getTopProducts() ──────────────────────────────────────────────────────────

describe('dashboard.repository — getTopProducts()', () => {
  test('retourne les 5 produits les plus vendus du mois', async () => {
    const fakeTop = [
      { id: 1, name: 'Fil DMC rouge', revenue: '450.00' },
      { id: 2, name: 'Aiguille',      revenue: '120.00' },
    ];
    pool.execute.mockResolvedValue([fakeTop]);
    const result = await dashboardRepository.getTopProducts({ month: 5, year: 2026 });
    expect(result).toEqual(fakeTop);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 5'), [5, 2026]
    );
  });

  test('filtre par mois et année', async () => {
    pool.execute.mockResolvedValue([[]]);
    await dashboardRepository.getTopProducts({ month: 3, year: 2025 });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('MONTH(o.created_at) = ?'), [3, 2025]
    );
  });
});

// ── getLowStock() ─────────────────────────────────────────────────────────────

describe('dashboard.repository — getLowStock()', () => {
  test('retourne les produits avec stock ≤ 5', async () => {
    const fakeLow = [
      { id: 3, name: 'Canevas blanc', stock: 2 },
      { id: 7, name: 'Fil or',        stock: 4 },
    ];
    pool.execute.mockResolvedValue([fakeLow]);
    const result = await dashboardRepository.getLowStock();
    expect(result).toEqual(fakeLow);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('stock <= 5')
    );
  });

  test('limite à 10 résultats', async () => {
    pool.execute.mockResolvedValue([[]]);
    await dashboardRepository.getLowStock();
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 10')
    );
  });

  test('exclut les produits supprimés et inactifs', async () => {
    pool.execute.mockResolvedValue([[]]);
    await dashboardRepository.getLowStock();
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_active = 1 AND p.deleted_at IS NULL')
    );
  });
});

// ── getRecentOrders() ─────────────────────────────────────────────────────────

describe('dashboard.repository — getRecentOrders()', () => {
  test('retourne les 8 dernières commandes avec les infos client', async () => {
    const fakeOrders = [
      { id: 10, status: 'paid',    total: '58.40', first_name: 'Julie', last_name: 'Test' },
      { id: 9,  status: 'pending', total: '24.90', first_name: 'Marc',  last_name: 'Dupont' },
    ];
    pool.execute.mockResolvedValue([fakeOrders]);
    const result = await dashboardRepository.getRecentOrders();
    expect(result).toEqual(fakeOrders);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 8')
    );
  });

  test('joint la table users pour les infos client', async () => {
    pool.execute.mockResolvedValue([[]]);
    await dashboardRepository.getRecentOrders();
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN users u ON u.id = o.user_id')
    );
  });
});
