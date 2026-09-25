const { orderNumber, orderFileSlug } = require('../../utils/orderNumber.utils');

// Numéro de commande affiché partout = numéro de facture (format ADM-18)
describe('orderNumber()', () => {
  test('commande facturée : le numéro de facture', () => {
    expect(orderNumber({ id: 102, invoice_number: '2026-09/22' })).toBe('2026-09/22');
  });

  test('ancienne facture au format annuel : conservée telle quelle', () => {
    expect(orderNumber({ id: 19, invoice_number: '2026-000013' })).toBe('2026-000013');
  });

  test('tentative en ligne non payée (pas encore de facture) : id interne', () => {
    expect(orderNumber({ id: 102, invoice_number: null })).toBe('#102');
  });
});

describe('orderFileSlug()', () => {
  test('la barre oblique ne peut pas figurer dans un nom de fichier', () => {
    expect(orderFileSlug({ id: 102, invoice_number: '2026-09/22' })).toBe('2026-09-22');
  });

  test('ancien format annuel inchangé', () => {
    expect(orderFileSlug({ id: 19, invoice_number: '2026-000013' })).toBe('2026-000013');
  });

  test('sans facture : id sur 6 chiffres, comme avant', () => {
    expect(orderFileSlug({ id: 102 })).toBe('000102');
  });
});
