/* Adresses aux normes La Poste : NPA suisse de 1000 à 9999, longueurs maximales
   de l'étiquette colis (nom, rue et localité 35 caractères, numéro 10). */
const { POSTAL_LIMITS, SWISS_ZIP_REGEX, POSTAL_MESSAGES } = require('../../utils/postalAddress.utils');
const { adminAddressSchema } = require('../../validators/customer.validator');
const { splitStreetAndNumber } = require('../../services/invoice.service');

const validAddress = {
  label: 'Maison', street: 'Rue du Bourg', street_number: '12',
  zip: '1510', city: 'Moudon', canton: 'VD', phone: '',
};

const issueFor = (result, field) => result.error?.issues.find((i) => i.path[0] === field);

describe('NPA suisse', () => {
  test.each(['1000', '1510', '9999'])('%s est accepté', (zip) => {
    expect(SWISS_ZIP_REGEX.test(zip)).toBe(true);
  });

  test.each(['0999', '0000', '123', '12345', '1O00', ''])('« %s » est refusé', (zip) => {
    expect(SWISS_ZIP_REGEX.test(zip)).toBe(false);
  });

  test('la fiche client admin refuse un NPA commençant par 0, avec le message La Poste', () => {
    const result = adminAddressSchema.safeParse({ ...validAddress, zip: '0123' });
    expect(result.success).toBe(false);
    expect(issueFor(result, 'zip').message).toBe(POSTAL_MESSAGES.zip);
  });
});

describe('Longueurs maximales La Poste', () => {
  test('une adresse aux limites exactes est acceptée', () => {
    const result = adminAddressSchema.safeParse({
      ...validAddress,
      first_name:    'P'.repeat(POSTAL_LIMITS.name),
      last_name:     'N'.repeat(POSTAL_LIMITS.name),
      street:        'R'.repeat(POSTAL_LIMITS.street),
      street_number: '1'.repeat(POSTAL_LIMITS.streetNumber),
      city:          'L'.repeat(POSTAL_LIMITS.city),
    });
    expect(result.success).toBe(true);
  });

  test.each([
    ['first_name',    POSTAL_LIMITS.name],
    ['last_name',     POSTAL_LIMITS.name],
    ['street',        POSTAL_LIMITS.street],
    ['street_number', POSTAL_LIMITS.streetNumber],
    ['city',          POSTAL_LIMITS.city],
  ])('%s au-delà de %i caractères est refusé', (field, max) => {
    const result = adminAddressSchema.safeParse({ ...validAddress, [field]: 'x'.repeat(max + 1) });
    expect(result.success).toBe(false);
    expect(issueFor(result, field)).toBeDefined();
  });
});

describe('Facture QR — adresse structurée de la boutique', () => {
  test.each([
    ['Chemin du Collège 6', { address: 'Chemin du Collège', buildingNumber: '6' }],
    ['Oltenstrasse 50A',    { address: 'Oltenstrasse', buildingNumber: '50A' }],
    ['Rue de Carouge 4/8',  { address: 'Rue de Carouge', buildingNumber: '4/8' }],
  ])('« %s » : rue et numéro séparés', (line, expected) => {
    expect(splitStreetAndNumber(line)).toEqual(expected);
  });

  test('sans numéro final, la ligne reste entière dans la rue', () => {
    expect(splitStreetAndNumber('Case postale')).toEqual({ address: 'Case postale' });
    expect(splitStreetAndNumber('Rue 12 bis')).toEqual({ address: 'Rue 12 bis' });
    expect(splitStreetAndNumber(undefined)).toEqual({ address: '' });
  });
});
