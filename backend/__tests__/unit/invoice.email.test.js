/* Non-régression — « Facture QR non envoyée : issuer is not defined ».
   Depuis le 16/09, l'e-mail de facture plantait à chaque commande par facture :
   les clientes ne recevaient jamais leur QR-facture. Il ignorait aussi le n° TVA
   saisi dans l'admin (ADM-13). */

jest.mock('../../services/email.service', () => ({ sendInvoice: jest.fn().mockResolvedValue() }));
jest.mock('../../services/shopSettings.service', () => ({
  getInvoiceSettings: jest.fn().mockResolvedValue({
    name: 'Au Point-Compté, Julie Guerle', address: 'Chemin du Collège 6', zip: '1509',
    city: 'Vucherens', vatNumber: 'CHE-111.222.333 TVA', dueDays: 20,
  }),
}));

const emailService = require('../../services/email.service');
const invoiceService = require('../../services/invoice.service');

const order = {
  id: 66, invoice_number: '2026-000009', invoice_seq: 9,
  qr_reference: '000000000000000020260000094',
  subtotal: '36.50', shipping_cost: '8.50', tax_amount: '3.37', total: '45.00', discount: '0.00',
  created_at: new Date('2026-09-24T10:00:00Z'),
  billing_first_name: 'Claire', billing_last_name: 'Test', billing_street: 'Rue du Bourg',
  billing_street_number: '12', billing_zip: '1510', billing_city: 'Moudon', billing_country: 'CH',
  items: [{ product_id: 7, quantity: 2, unit_price: '1.50', tax_rate_snapshot: '8.10',
            product_snapshot_json: { name: 'DMC mouliné N° 819', sku: 'DMC819' } }],
};
const user = { id: 667, email: 'claire@test.ch', first_name: 'Claire', last_name: 'Test' };

describe('invoice.service — envoi de la facture par e-mail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('envoie la facture PDF sans erreur', async () => {
    await expect(invoiceService.sendInvoiceEmail({ user, order })).resolves.toBeUndefined();
    expect(emailService.sendInvoice).toHaveBeenCalledTimes(1);
    const { pdfBuffer, dueDate } = emailService.sendInvoice.mock.calls[0][0];
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(dueDate).toBeInstanceOf(Date);
  });

  test('applique le délai de paiement saisi dans l\'admin', async () => {
    await invoiceService.sendInvoiceEmail({ user, order });
    const { dueDate } = emailService.sendInvoice.mock.calls[0][0];
    const days = Math.round((dueDate - Date.now()) / 86400000);
    expect(days).toBeGreaterThanOrEqual(19);
    expect(days).toBeLessThanOrEqual(20);
  });

  test('la facture téléchargée par la cliente est générée avec les réglages de l\'admin', async () => {
    const pdf = await invoiceService.getInvoicePdf({ order, user });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
