// Tests unitaires settings.repository — pool mocké, aucune BDD requise

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
  },
}));

const { pool }             = require('../../config/db');
const settingsRepository   = require('../../repositories/settings.repository');

beforeEach(() => jest.clearAllMocks());

// ── findAllTaxRates() ─────────────────────────────────────────────────────────

describe('settings.repository — findAllTaxRates()', () => {
  test('retourne tous les taux TVA', async () => {
    const fakeTaxRates = [
      { id: 1, name: 'Standard', rate: '8.1', is_default: 1 },
      { id: 2, name: 'Réduit',   rate: '2.6', is_default: 0 },
    ];
    pool.execute.mockResolvedValue([fakeTaxRates]);
    const result = await settingsRepository.findAllTaxRates();
    expect(result).toEqual(fakeTaxRates);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM tax_rates')
    );
  });
});

// ── updateTaxRate() ───────────────────────────────────────────────────────────

describe('settings.repository — updateTaxRate()', () => {
  test('met à jour le taux TVA par id', async () => {
    pool.execute.mockResolvedValue([{}]);
    await settingsRepository.updateTaxRate(1, { rate: 8.1 });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tax_rates SET rate = ?'), [8.1, 1]
    );
  });
});

// ── findAllShippingRates() ────────────────────────────────────────────────────

describe('settings.repository — findAllShippingRates()', () => {
  test('retourne les tarifs de livraison avec la zone', async () => {
    const fakeRates = [
      { id: 1, name: 'Standard CH', price_chf: '8.50', zone_name: 'Suisse', carrier: 'Swiss Post' },
    ];
    pool.query.mockResolvedValue([fakeRates]);
    const result = await settingsRepository.findAllShippingRates();
    expect(result).toEqual(fakeRates);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM shipping_rates sr')
    );
  });
});

// ── updateShippingRate() ──────────────────────────────────────────────────────

describe('settings.repository — updateShippingRate()', () => {
  test('met à jour price_chf uniquement', async () => {
    pool.execute.mockResolvedValue([{}]);
    await settingsRepository.updateShippingRate(1, { priceChf: 9.50 });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('price_chf = ?'), [9.50, 1]
    );
  });

  test('met à jour estimatedDays uniquement', async () => {
    pool.execute.mockResolvedValue([{}]);
    await settingsRepository.updateShippingRate(2, { estimatedDays: 3 });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('estimated_days = ?'), [3, 2]
    );
  });

  test('met à jour les deux champs simultanément', async () => {
    pool.execute.mockResolvedValue([{}]);
    await settingsRepository.updateShippingRate(1, { priceChf: 10.00, estimatedDays: 2 });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('price_chf = ?'),
      [10.00, 2, 1]
    );
  });

  test('ne fait rien si aucun champ fourni', async () => {
    await settingsRepository.updateShippingRate(1, {});
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ── findSettings() ────────────────────────────────────────────────────────────

describe('settings.repository — findSettings()', () => {
  test('retourne un objet clé/valeur pour les clés demandées', async () => {
    pool.execute.mockResolvedValue([[
      { key: 'store_name',  value: 'Au Point-Compté' },
      { key: 'store_email', value: 'contact@broderie.ch' },
    ]]);
    const result = await settingsRepository.findSettings(['store_name', 'store_email']);
    expect(result).toEqual({
      store_name:  'Au Point-Compté',
      store_email: 'contact@broderie.ch',
    });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE `key` IN'),
      ['store_name', 'store_email']
    );
  });

  test('retourne une chaîne vide pour les clés sans valeur (null)', async () => {
    pool.execute.mockResolvedValue([[
      { key: 'cgv', value: null },
    ]]);
    const result = await settingsRepository.findSettings(['cgv']);
    expect(result.cgv).toBe('');
  });
});

// ── upsertSettings() ──────────────────────────────────────────────────────────

describe('settings.repository — upsertSettings()', () => {
  test('insère ou met à jour plusieurs paramètres', async () => {
    pool.execute.mockResolvedValue([{}]);
    await settingsRepository.upsertSettings({
      store_name:  'Au Point-Compté',
      store_email: 'contact@broderie.ch',
    });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('ON DUPLICATE KEY UPDATE'),
      ['store_name', 'Au Point-Compté', 'store_email', 'contact@broderie.ch']
    );
  });

  test('ne fait rien si entries est vide', async () => {
    await settingsRepository.upsertSettings({});
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('remplace les valeurs null par une chaîne vide', async () => {
    pool.execute.mockResolvedValue([{}]);
    await settingsRepository.upsertSettings({ mentions_legales: null });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(),
      ['mentions_legales', '']
    );
  });
});

// ── Constantes exportées ──────────────────────────────────────────────────────

describe('settings.repository — constantes', () => {
  test('STORE_KEYS contient les clés boutique attendues', () => {
    expect(settingsRepository.STORE_KEYS).toContain('store_name');
    expect(settingsRepository.STORE_KEYS).toContain('store_email');
  });

  test('LEGAL_KEYS contient les clés légales attendues', () => {
    expect(settingsRepository.LEGAL_KEYS).toContain('cgv');
    expect(settingsRepository.LEGAL_KEYS).toContain('mentions_legales');
  });
});
