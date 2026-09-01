// Tests unitaires order.controller (admin)

jest.mock('../../repositories/order.repository', () => ({
  findAllAdmin: jest.fn(),
  findById:     jest.fn(),
  updateStatusWithHistory: jest.fn(),
}));

jest.mock('../../repositories/user.repository', () => ({
  findById: jest.fn(),
}));

jest.mock('../../services/email.service', () => ({
  sendOrderShipped: jest.fn().mockResolvedValue({}),
  sendPickupReady:  jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/shipping.service', () => ({
  generateLabel: jest.fn(),
}));

jest.mock('../../services/loyalty.service', () => ({
  processRefund: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/invoice.service', () => ({
  generateInvoicePDF: jest.fn(),
}));

const orderRepository = require('../../repositories/order.repository');
const userRepository  = require('../../repositories/user.repository');
const emailService    = require('../../services/email.service');
const shippingService = require('../../services/shipping.service');
const loyaltyService  = require('../../services/loyalty.service');
const { generateInvoicePDF } = require('../../services/invoice.service');
const controller      = require('../../controllers/admin/order.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status    = jest.fn().mockReturnValue(res);
  res.json      = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send      = jest.fn().mockReturnValue(res);
  return res;
};


const fakeOrder = {
  id: 42,
  user_id: 10,
  status: 'processing',
  total: 65.90,
  street: 'Rue du Lac 12',
  tracking_number: null,
};

const fakeUser = { id: 10, email: 'marie@test.ch', first_name: 'Marie', locale: 'fr' };

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('order.admin.controller — getAll()', () => {
  test('retourne la liste paginée des commandes', async () => {
    orderRepository.findAllAdmin.mockResolvedValue({ rows: [fakeOrder], total: 1 });

    const req = { query: {} };
    const res = makeRes();
    const next = jest.fn();

    await controller.getAll(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(res.json.mock.calls[0][0].pagination.total).toBe(1);
  });

  test('applique le filtre status si fourni', async () => {
    orderRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { status: 'shipped' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(orderRepository.findAllAdmin.mock.calls[0][0].status).toBe('shipped');
  });

  test('respecte la limite max 100', async () => {
    orderRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { limit: '999' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(orderRepository.findAllAdmin.mock.calls[0][0].limit).toBe(100);
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('order.admin.controller — getById()', () => {
  test('retourne la commande', async () => {
    orderRepository.findById.mockResolvedValue(fakeOrder);

    const req = { params: { id: '42' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.getById(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeOrder });
  });

  test('retourne 404 si commande introuvable', async () => {
    orderRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.getById(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── updateStatus() ────────────────────────────────────────────────────────────

describe('order.admin.controller — updateStatus()', () => {
  test('met à jour le statut et retourne la commande mise à jour', async () => {
    orderRepository.updateStatusWithHistory.mockResolvedValue(true);
    orderRepository.findById.mockResolvedValue({ ...fakeOrder, status: 'paid' });
    userRepository.findById.mockResolvedValue(fakeUser);

    const req = { params: { id: '42' }, body: { status: 'paid', note: 'Paiement reçu' }, user: { id: 1 } };
    const res = makeRes();
    await controller.updateStatus(req, res, jest.fn());

    expect(orderRepository.updateStatusWithHistory).toHaveBeenCalledWith(42, 'paid', 'Paiement reçu', 1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 400 si statut invalide, sans toucher au repo', async () => {
    const req = { params: { id: '42' }, body: { status: 'invalid_status' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(orderRepository.updateStatusWithHistory).not.toHaveBeenCalled();
  });

  test('retourne 404 si le repo signale une commande introuvable', async () => {
    orderRepository.updateStatusWithHistory.mockResolvedValue(false);

    const req = { params: { id: '999' }, body: { status: 'paid' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('propage l\'erreur du repo', async () => {
    orderRepository.updateStatusWithHistory.mockRejectedValue(new Error('DB crash'));

    const req = { params: { id: '1' }, body: { status: 'paid' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('envoie email sendOrderShipped quand statut = shipped', async () => {
    orderRepository.updateStatusWithHistory.mockResolvedValue(true);
    orderRepository.findById.mockResolvedValue({ ...fakeOrder, status: 'shipped', shipping_street: 'Rue 1' });
    userRepository.findById.mockResolvedValue(fakeUser);
    shippingService.generateLabel.mockResolvedValue({ trackingNumber: '99.00.111111.11111111' });

    const req = { params: { id: '42' }, body: { status: 'shipped' }, user: { id: 1 } };
    const res = makeRes();
    await controller.updateStatus(req, res, jest.fn());
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(emailService.sendOrderShipped).toHaveBeenCalled();
  });

  test('débite la fidélité pour statut "cancelled" (commande déjà payée)', async () => {
    orderRepository.updateStatusWithHistory.mockResolvedValue(true);
    orderRepository.findById.mockResolvedValue({ ...fakeOrder, status: 'paid' });
    userRepository.findById.mockResolvedValue(fakeUser);

    const req = { params: { id: '1' }, body: { status: 'cancelled' }, user: { id: 1 } };
    const res = makeRes();
    await controller.updateStatus(req, res, jest.fn());
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(loyaltyService.processRefund).toHaveBeenCalled();
  });

  test('débite la fidélité pour statut "refunded"', async () => {
    orderRepository.updateStatusWithHistory.mockResolvedValue(true);
    orderRepository.findById.mockResolvedValue({ ...fakeOrder, status: 'delivered' });
    userRepository.findById.mockResolvedValue(fakeUser);

    const req = { params: { id: '1' }, body: { status: 'refunded' }, user: { id: 1 } };
    const res = makeRes();
    await controller.updateStatus(req, res, jest.fn());
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(loyaltyService.processRefund).toHaveBeenCalled();
  });
});

// ── downloadInvoice() ─────────────────────────────────────────────────────────

describe('order.admin.controller — downloadInvoice()', () => {
  test('retourne le PDF de la facture', async () => {
    orderRepository.findById.mockResolvedValue(fakeOrder);
    userRepository.findById.mockResolvedValue(fakeUser);
    generateInvoicePDF.mockResolvedValue(Buffer.from('fake-pdf'));

    const req = { params: { id: '42' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadInvoice(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('facture-')
    );
    expect(res.send).toHaveBeenCalled();
  });

  test('retourne 404 si commande introuvable', async () => {
    orderRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadInvoice(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('retourne 404 si client introuvable', async () => {
    orderRepository.findById.mockResolvedValue(fakeOrder);
    userRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '42' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadInvoice(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
