/* ADM-09 — règles de mise en forme du suivi des factures et des réassorts */
jest.mock('../../repositories/restock.repository', () => ({
  summaryBySupplier: jest.fn(),
  itemsForSupplier: jest.fn(),
  findSupplierContact: jest.fn(),
  LOW_STOCK_THRESHOLD: 5,
}));
jest.mock('../../services/shopSettings.service', () => ({ getInvoiceSettings: jest.fn().mockResolvedValue({ dueDays: 30 }) }));

const restockRepository = require('../../repositories/restock.repository');
const restockService = require('../../services/restock.service');
const { toInvoice } = require('../../services/invoiceTracking.service');

const DAY = 24 * 60 * 60 * 1000;

describe('toInvoice — statut de paiement d\'une facture QR', () => {
  const now = new Date('2026-10-30T12:00:00Z').getTime();
  const row = (createdAt, paidAt = null) => ({
    id: 1, invoice_number: '2026-000001', qr_reference: '0'.repeat(27), created_at: createdAt,
    total: '45.00', status: 'pending_invoice', first_name: 'Claire', last_name: 'Test', email: 'c@t.ch', paid_at: paidAt,
  });

  test('échéance non atteinte : à payer', () => {
    const inv = toInvoice(row(new Date(now - 10 * DAY)), 30, now);
    expect(inv.paymentStatus).toBe('unpaid');
    expect(inv.daysOverdue).toBe(0);
  });

  test('échéance dépassée : en retard, avec le nombre de jours', () => {
    const inv = toInvoice(row(new Date(now - 45 * DAY)), 30, now);
    expect(inv.paymentStatus).toBe('overdue');
    expect(inv.daysOverdue).toBe(15);
  });

  test('paiement enregistré : payée, même après l\'échéance', () => {
    const inv = toInvoice(row(new Date(now - 45 * DAY), new Date(now - 2 * DAY)), 30, now);
    expect(inv.paymentStatus).toBe('paid');
    expect(inv.daysOverdue).toBe(0);
  });

  test('échéance = date de facture + délai de paiement', () => {
    const created = new Date('2026-09-24T08:00:00Z');
    expect(toInvoice(row(created), 30, now).dueDate).toBe(new Date(created.getTime() + 30 * DAY).toISOString());
  });
});

describe('restock.service — synthèse par fournisseur', () => {
  test('les fournisseurs attendus par des clientes passent en tête, puis le stock bas', async () => {
    restockRepository.summaryBySupplier.mockResolvedValue({
      demand: [{ supplier_id: 2, demand_items: 1, demand_qty: 3 }],
      low: [
        { supplier_id: 1, low_stock_items: 50 },
        { supplier_id: 2, low_stock_items: 4 },
        { supplier_id: null, low_stock_items: 7 },
      ],
      suppliers: [{ id: 1, name: 'DMC' }, { id: 2, name: 'Permin' }],
    });
    const summary = await restockService.getSummary();
    expect(summary.map((s) => s.name)).toEqual(['Permin', 'DMC', 'Sans fournisseur']);
    expect(summary[0]).toMatchObject({ supplierId: 2, demandItems: 1, demandQty: 3, lowStockItems: 4 });
    expect(summary[2].supplierId).toBe('sans-fournisseur');
  });

  test('un article attendu ET en stock bas n\'apparaît qu\'une fois', async () => {
    restockRepository.findSupplierContact.mockResolvedValue({ id: 2, name: 'Permin' });
    restockRepository.itemsForSupplier.mockResolvedValue({
      demand: [{ product_id: 10, ordered_qty: 2, order_ids: '5,7', first_order_at: '2026-09-20' }],
      low: [{ product_id: 10 }, { product_id: 11 }],
      products: [
        { id: 10, sku: 'A', stock: 1, is_made_to_order: 0, name: 'Kit A' },
        { id: 11, sku: 'B', stock: 0, is_made_to_order: 0, name: 'Kit B' },
      ],
      truncated: false,
    });
    const { items } = await restockService.getSupplierItems('2');
    expect(items.map((i) => i.productId)).toEqual([10, 11]);
    expect(items[0]).toMatchObject({ orderedQty: 2, orderIds: [5, 7], lowStock: true });
  });
});
