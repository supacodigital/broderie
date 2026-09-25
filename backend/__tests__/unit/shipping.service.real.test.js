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
  printPreview:   true,
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

// Réponse type de la Barcode API — exemple officiel : `item` est un objet
const PDF_BASE64 = Buffer.from('%PDF-1.4 étiquette').toString('base64');
const apiResponse = {
  labelDefinition: { labelLayout: 'A6', imageFileType: 'pdf', imageResolution: 300, printPreview: true },
  item: {
    itemID:    '42',
    identCode: '993456789012345678',
    label:     [PDF_BASE64],
  },
};
const address = {
  street: fakeOrder.shipping_street, street_number: fakeOrder.shipping_street_number,
  city: fakeOrder.shipping_city, zip: fakeOrder.shipping_zip,
};

describe('shipping.service — createLabel() mode réel', () => {
  test('appelle generateAddressLabel avec frankingLicense, customer et item', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);

    await service.createLabel({ order: fakeOrder, address });

    expect(swissPostClient.generateAddressLabel).toHaveBeenCalledTimes(1);
    const payload = swissPostClient.generateAddressLabel.mock.calls[0][0];
    expect(payload.frankingLicense).toBe('987654');
    expect(payload.customer).toMatchObject({ country: 'CH' });
    // `item` est UN objet (exemple officiel) : envoyé en tableau, La Poste répondait HTTP 400
    expect(Array.isArray(payload.item)).toBe(false);
    expect(payload.item.itemID).toBe('42');
    // rue et numéro séparés, comme dans l'exemple officiel
    expect(payload.item.recipient).toEqual({
      name1: 'Marie Dupont', street: 'Rue du Lac', houseNo: '12', zip: '1000', city: 'Lausanne', country: 'CH',
    });
    // poids en grammes : 2 × 0.3 = 0.6 kg → 600 g
    expect(payload.item.attributes).toEqual({ przl: ['PRI'], weight: 600 });
    expect(payload.labelDefinition).toMatchObject({ labelLayout: 'A6', imageFileType: 'PDF', printPreview: true });
  });

  test('respecte les longueurs maximales de La Poste (35 caractères, numéro 10)', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);
    const long = 'Chemin de la Très Longue Allée des Marronniers Centenaires';

    await service.createLabel({
      order: { ...fakeOrder, first_name: 'Marie-Christine-Alexandra', last_name: 'de la Fontaine-Dubois' },
      address: { ...address, street: long, street_number: '12bis-escalier-B' },
    });

    const { recipient } = swissPostClient.generateAddressLabel.mock.calls[0][0].item;
    expect(recipient.name1).toHaveLength(35);
    expect(recipient.street).toBe(long.slice(0, 35));
    expect(recipient.houseNo).toHaveLength(10);
  });

  test('sans numéro de rue : champ houseNo absent', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);

    await service.createLabel({ order: fakeOrder, address: { ...address, street: 'Rue du Lac 12', street_number: null } });

    // tel qu'envoyé à La Poste (JSON) : un champ vide n'est pas transmis
    const { recipient } = JSON.parse(JSON.stringify(swissPostClient.generateAddressLabel.mock.calls[0][0])).item;
    expect(recipient.street).toBe('Rue du Lac 12');
    expect(recipient).not.toHaveProperty('houseNo');
  });

  // ADM-10 — le produit La Poste suit le choix fait dans l'admin
  test('PostPac Economy : przl ECO ; Priority par défaut', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);

    await service.createLabel({ order: fakeOrder, address, product: 'ECO' });
    await service.createLabel({ order: fakeOrder, address });

    const [eco, byDefault] = swissPostClient.generateAddressLabel.mock.calls.slice(-2).map(c => c[0]);
    expect(eco.item.attributes.przl).toEqual(['ECO']);
    expect(byDefault.item.attributes.przl).toEqual(['PRI']);
  });

  test('produit inconnu : refusé avant tout appel à La Poste', async () => {
    const calls = swissPostClient.generateAddressLabel.mock.calls.length;
    await expect(service.createLabel({
      order: fakeOrder,
      address: { street: fakeOrder.shipping_street, city: fakeOrder.shipping_city, zip: fakeOrder.shipping_zip },
      product: 'EXPRESS',
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(swissPostClient.generateAddressLabel.mock.calls.length).toBe(calls);
  });

  test('identCode = n° de suivi, étiquette décodée en PDF, lien de suivi post.ch', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);

    const result = await service.createLabel({ order: fakeOrder, address });

    expect(result.trackingNumber).toBe('993456789012345678');
    expect(Buffer.isBuffer(result.labelPdf)).toBe(true);
    expect(result.labelPdf.toString()).toBe('%PDF-1.4 étiquette');
    // le lien tient dans label_url (500 caractères), contrairement au PDF
    expect(result.labelUrl).toBe('https://www.post.ch/fr/outils/suivi-de-colis?track=993456789012345678');
    expect(result.labelId).toBe('42');
    expect(result.carrierId).toBe('swiss-post'); // pas « -mock »
  });

  test('HTTP 400 de La Poste : 502 avec les codes d\'erreur lisibles dans l\'admin', async () => {
    const err = Object.assign(new Error('generateAddressLabel La Poste CH a échoué (HTTP 400)'), {
      status: 400,
      detail: JSON.stringify({ errors: [{ code: 'E2012', message: 'Licence d\'affranchissement invalide' }] }),
    });
    swissPostClient.generateAddressLabel.mockRejectedValue(err);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.createLabel({ order: fakeOrder, address })).rejects.toMatchObject({
      statusCode: 502,
      message: 'La Poste a refusé la demande d\'étiquette (HTTP 400) : E2012 Licence d\'affranchissement invalide',
    });
    console.error.mockRestore();
  });

  test('HTTP 400 sans corps : 502, message explicite plutôt qu\'une erreur 500', async () => {
    swissPostClient.generateAddressLabel.mockRejectedValue(Object.assign(new Error('x'), { status: 400, detail: '' }));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.createLabel({ order: fakeOrder, address })).rejects.toMatchObject({
      statusCode: 502,
      message: 'La Poste a refusé la demande d\'étiquette (HTTP 400), sans préciser la raison.',
    });
    console.error.mockRestore();
  });

  test('La Poste injoignable : 502 « réessayez »', async () => {
    swissPostClient.generateAddressLabel.mockRejectedValue(new Error('fetch failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.createLabel({ order: fakeOrder, address })).rejects.toMatchObject({
      statusCode: 502, message: expect.stringMatching(/Réessayez/),
    });
    console.error.mockRestore();
  });

  test('réponse sans étiquette mais avec erreurs de l\'envoi : 502 avec le motif', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue({
      item: { itemID: '42', errors: [{ code: 'E1015', message: 'NPA inconnu' }] },
    });

    await expect(service.createLabel({ order: fakeOrder, address })).rejects.toMatchObject({
      statusCode: 502, message: 'La Poste n\'a pas généré l\'étiquette : E1015 NPA inconnu',
    });
  });

  test('lève AppError 502 si la réponse ne contient aucun item', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue({});

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
  test('persiste le n° de suivi, le lien de suivi, label_id et le PDF en base', async () => {
    swissPostClient.generateAddressLabel.mockResolvedValue(apiResponse);
    pool.execute.mockResolvedValue([{}]);

    const result = await service.generateLabel(42, fakeOrder);

    expect(result.trackingNumber).toBe('993456789012345678');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders SET tracking_number'),
      [result.trackingNumber, result.labelUrl, result.labelId, result.labelPdf, 42]
    );
    // le lien de suivi tient dans label_url VARCHAR(500)
    expect(result.labelUrl.length).toBeLessThan(500);
  });
});
