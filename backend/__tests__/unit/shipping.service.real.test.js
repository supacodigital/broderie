// Tests unitaires shipping.service — MODE RÉEL (API La Poste CH activée)
// On force isMock:false et on simule la réponse de generateAddressLabel.

jest.mock('../../config/db', () => ({ pool: { execute: jest.fn() } }));

// Config Swiss Post simulée comme « configurée » (mode réel)
jest.mock('../../config/swissPost', () => ({
  clientId:       'real-client-id',
  clientSecret:   'real-secret',
  kundennummer:   '123456',
  frankiernummer: '987654',
  tokenUrl:       'https://api.post.ch/OAuth/token',
  labelUrl:       'https://dcapi.apis.post.ch/barcode/v1/generateAddressLabel',
  scope:          'DCAPI_BARCODE_READ',
  isMock:         false,
}));

// Client HTTP La Poste CH mocké — on contrôle la réponse de l'API
jest.mock('../../config/swissPostClient', () => ({
  generateAddressLabel: jest.fn(),
}));

const { pool }        = require('../../config/db');
const swissPostClient = require('../../config/swissPostClient');
const service         = require('../../services/shipping.service');

beforeEach(() => jest.clearAllMocks());

const fakeOrder = {
  id: 42,
  first_name: 'Marie',
  last_name:  'Dupont',
  shipping_street:        'Rue du Lac',
  shipping_street_number: '12',
  shipping_city:          'Lausanne',
  shipping_zip:           '1000',
  shipping_canton:        'VD',
  shipping_country:       'CH',
  items: [{ product_id: 1, quantity: 2, weight_kg: 0.3 }],
};

// Réponse type de la Barcode API
const apiResponse = {
  item: [{
    itemID:    '42',
    identCode: '993456789012345678',
    label:     ['JVBERi0xLjQKJ...base64pdf...'], // PDF base64 (tronqué)
  }],
};

describe('shipping.service — createLabel() mode réel', () => {
  test('appelle generateAddressLabel avec frankingLicense, customer et item', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);

    await service.createLabel({
      order:   fakeOrder,
      address: { street: fakeOrder.shipping_street, city: fakeOrder.shipping_city, zip: fakeOrder.shipping_zip },
    });

    expect(swissPostClient.generateAddressLabel).toHaveBeenCalledTimes(1);
    const payload = swissPostClient.generateAddressLabel.mock.calls[0][0];
    expect(payload.frankingLicense).toBe('987654');
    expect(payload.customer).toMatchObject({ country: 'CH' });
    expect(payload.item[0].recipient).toMatchObject({ zip: '1000', city: 'Lausanne' });
    // poids en grammes : 2 × 0.3 = 0.6 kg → 600 g
    expect(payload.item[0].attributes.weight).toBe(600);
  });

  test('parse identCode comme trackingNumber et label base64 en data URI PDF', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);

    const result = await service.createLabel({
      order:   fakeOrder,
      address: { street: fakeOrder.shipping_street, city: fakeOrder.shipping_city, zip: fakeOrder.shipping_zip },
    });

    expect(result.trackingNumber).toBe('993456789012345678');
    expect(result.labelUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(result.labelId).toBe('42');
    expect(result.carrierId).toBe('swiss-post'); // pas « -mock »
  });

  test('lève AppError 502 si la réponse ne contient aucun item', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue({ item: [] });

    await expect(
      service.createLabel({
        order:   fakeOrder,
        address: { street: fakeOrder.shipping_street, city: fakeOrder.shipping_city, zip: fakeOrder.shipping_zip },
      })
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  test('valide l\'adresse AVANT d\'appeler l\'API (422, pas d\'appel réseau)', async () => {
    await expect(
      service.createLabel({
        order:   fakeOrder,
        address: { street: 'Rue 1', city: 'Lausanne' }, // zip manquant
      })
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(swissPostClient.generateAddressLabel).not.toHaveBeenCalled();
  });
});

describe('shipping.service — generateLabel() mode réel', () => {
  test('persiste tracking_number, label_url (data URI) et label_id en base', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);
    pool.execute.mockResolvedValue([{}]);

    const result = await service.generateLabel(42, fakeOrder);

    expect(result.trackingNumber).toBe('993456789012345678');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders SET tracking_number'),
      [result.trackingNumber, result.labelUrl, result.labelId, 42]
    );
  });
});
