/* Numéro de facture « 2026-09/01 » — ticket ADM-18 (« l'année et le mois plus
   un numéro »). */
const { zurichYearMonth, formatInvoiceNumber, parseInvoiceNumber, invoicePeriod } = require('../../utils/invoiceNumber.utils');

describe('invoiceNumber.utils', () => {
  test('format de la cliente : année-mois/numéro sur deux chiffres', () => {
    expect(formatInvoiceNumber({ year: 2026, month: 9 }, 1)).toBe('2026-09/01');
    expect(formatInvoiceNumber({ year: 2026, month: 10 }, 12)).toBe('2026-10/12');
    expect(formatInvoiceNumber({ year: 2026, month: 10 }, 125)).toBe('2026-10/125');
    expect(invoicePeriod({ year: 2026, month: 9 })).toBe('2026-09');
  });

  test('relit un numéro mensuel comme un numéro annuel d\'avant ADM-18', () => {
    expect(parseInvoiceNumber('2026-10/07')).toEqual({ year: 2026, month: 10, seq: 7 });
    expect(parseInvoiceNumber('2026-000013')).toEqual({ year: 2026, month: null, seq: 13 });
    expect(parseInvoiceNumber('APC123')).toBeNull();
    expect(parseInvoiceNumber(null)).toBeNull();
  });

  /* Le serveur tourne en UTC : une facture du 1er octobre à 00h30 en Suisse
     (30 septembre 22h30 UTC) appartient à octobre. */
  test('le mois est celui de la Suisse, pas celui du serveur', () => {
    expect(zurichYearMonth(new Date('2026-09-30T22:30:00Z'))).toEqual({ year: 2026, month: 10 });
    expect(zurichYearMonth(new Date('2026-12-31T23:30:00Z'))).toEqual({ year: 2027, month: 1 });
    expect(zurichYearMonth(new Date('2026-09-25T10:00:00Z'))).toEqual({ year: 2026, month: 9 });
  });
});
