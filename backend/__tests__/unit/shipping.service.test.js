// Tests unitaires shipping.service (mock Swiss Post)

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const { pool }   = require('../../config/db');
const service    = require('../../services/shipping.service');

beforeEach(() => jest.clearAllMocks());

const fakeOrder = {
  id: 1,
  first_name: 'Marie',
  last_name:  'Dupont',
  street:     'Rue du Lac 12',
  city:       'Lausanne',
  zip:        '1000',
  canton:     'VD',
  country:    'CH',
  items: [
    { product_id: 1, quantity: 2, weight_kg: 0.3 },
    { product_id: 2, quantity: 1, weight_kg: 0.1 },
  ],
};

// ── createLabel() ─────────────────────────────────────────────────────────────

describe('shipping.service — createLabel()', () => {
  test('génère un numéro de suivi au format Swiss Post (99.00.XXXXXX.XXXXXXXX)', async () => {
    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: fakeOrder.street, city: fakeOrder.city, zip: fakeOrder.zip },
    });

    expect(result.trackingNumber).toMatch(/^99\.00\.\d{6}\.\d{8}$/);
  });

  test('génère un labelId commençant par "mock-"', async () => {
    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: 'Rue 1', city: 'Zurich', zip: '8000' },
    });

    expect(result.labelId).toMatch(/^mock-[a-z0-9]{12}$/);
  });

  test('retourne une labelUrl contenant le trackingNumber', async () => {
    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: 'Rue 1', city: 'Genève', zip: '1200' },
    });

    expect(result.labelUrl).toContain(result.trackingNumber);
    expect(result.labelUrl).toContain('post.ch');
  });

  test('retourne le carrierId et le serviceCode', async () => {
    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: 'Rue 1', city: 'Berne', zip: '3000' },
    });

    expect(result.carrierId).toBe('swiss-post-mock');
    expect(result.serviceCode).toBe('priority');
  });

  test('calcule le poids total à partir des items', async () => {
    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: 'Rue 1', city: 'Lausanne', zip: '1000' },
    });

    // 2 × 0.3 + 1 × 0.1 = 0.7
    expect(result.weightKg).toBeCloseTo(0.7);
  });

  test('utilise 0.5 kg par défaut si pas d\'items', async () => {
    const orderNoItems = { ...fakeOrder, items: undefined };
    const result = await service.createLabel({
      order:   orderNoItems,
      address: { street: 'Rue 1', city: 'Lausanne', zip: '1000' },
    });

    expect(result.weightKg).toBe(0.5);
  });

  test('utilise 0.2 kg par défaut si weight_kg absent sur un item', async () => {
    const orderMissingWeight = {
      ...fakeOrder,
      items: [{ product_id: 1, quantity: 2 }], // pas de weight_kg
    };
    const result = await service.createLabel({
      order:   orderMissingWeight,
      address: { street: 'Rue 1', city: 'Lausanne', zip: '1000' },
    });

    expect(result.weightKg).toBeCloseTo(0.4); // 2 × 0.2
  });

  test('lève AppError 422 si adresse incomplète (zip manquant)', async () => {
    await expect(
      service.createLabel({
        order:   fakeOrder,
        address: { street: 'Rue 1', city: 'Lausanne' }, // zip absent
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('lève AppError 422 si adresse incomplète (street manquant)', async () => {
    await expect(
      service.createLabel({
        order:   fakeOrder,
        address: { city: 'Lausanne', zip: '1000' },
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('concatène first_name + last_name depuis l\'order si absent de l\'adresse', async () => {
    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: 'Rue 1', city: 'Lausanne', zip: '1000' },
    });

    expect(result.recipient).toBe('Marie Dupont');
  });
});

// ── generateLabel() ───────────────────────────────────────────────────────────

describe('shipping.service — generateLabel()', () => {
  test('génère le label et met à jour la commande en base', async () => {
    pool.execute.mockResolvedValue([{}]);

    const result = await service.generateLabel(1, fakeOrder);

    expect(result.trackingNumber).toMatch(/^99\.00\./);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders SET tracking_number'),
      [result.trackingNumber, result.labelUrl, result.labelId, 1]
    );
  });

  test('lève AppError 422 si l\'adresse de l\'order est incomplète', async () => {
    const orderBad = { ...fakeOrder, street: null };

    await expect(service.generateLabel(1, orderBad))
      .rejects.toMatchObject({ statusCode: 422 });

    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ── getTrackingByLabelId() ────────────────────────────────────────────────────

describe('shipping.service — getTrackingByLabelId()', () => {
  test('retourne le statut simulé pour un labelId valide', async () => {
    const result = await service.getTrackingByLabelId('mock-abc123def456');

    expect(result.labelId).toBe('mock-abc123def456');
    expect(result.status).toBe('in_transit');
    expect(result.carrierCode).toBe('swiss-post');
    expect(Array.isArray(result.events)).toBe(true);
  });

  test('lève AppError 400 si labelId absent', async () => {
    await expect(service.getTrackingByLabelId(null))
      .rejects.toMatchObject({ statusCode: 400 });

    await expect(service.getTrackingByLabelId(undefined))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('retourne une description non vide', async () => {
    const result = await service.getTrackingByLabelId('mock-xyz');
    expect(result.description).toBeTruthy();
  });
});
