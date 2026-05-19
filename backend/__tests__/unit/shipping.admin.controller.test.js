// Tests unitaires shipping.controller (admin)

jest.mock('pdfkit', () => {
  const EventEmitter = require('events');
  const MockDoc = function () {
    const emitter = new EventEmitter();
    return {
      on:          jest.fn(),
      pipe:        jest.fn(),
      end:         jest.fn(),
      fontSize:    jest.fn().mockReturnThis(),
      font:        jest.fn().mockReturnThis(),
      text:        jest.fn().mockReturnThis(),
      moveDown:    jest.fn().mockReturnThis(),
      moveTo:      jest.fn().mockReturnThis(),
      lineTo:      jest.fn().mockReturnThis(),
      stroke:      jest.fn().mockReturnThis(),
      y:           100,
    };
  };
  return MockDoc;
});

jest.mock('../../repositories/order.repository', () => ({
  findById: jest.fn(),
}));

jest.mock('../../services/shipping.service', () => ({
  generateLabel: jest.fn(),
}));

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const orderRepository = require('../../repositories/order.repository');
const shippingService = require('../../services/shipping.service');
const { pool }        = require('../../config/db');
const controller      = require('../../controllers/admin/shipping.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status      = jest.fn().mockReturnValue(res);
  res.json        = jest.fn().mockReturnValue(res);
  res.setHeader   = jest.fn().mockReturnValue(res);
  res.redirect    = jest.fn().mockReturnValue(res);
  res.send        = jest.fn().mockReturnValue(res);
  return res;
};

const fakeOrder = {
  id: 1,
  first_name: 'Marie',
  last_name:  'Dupont',
  street:     'Rue du Lac 12',
  zip:        '1000',
  city:       'Lausanne',
  tracking_number: null,
  label_id:   null,
  label_url:  null,
  user_id:    10,
};

// ── generateLabel() ───────────────────────────────────────────────────────────

describe('shipping.admin.controller — generateLabel()', () => {
  test('génère l\'étiquette et retourne trackingNumber + labelUrl + labelId', async () => {
    orderRepository.findById.mockResolvedValue(fakeOrder);
    shippingService.generateLabel.mockResolvedValue({
      trackingNumber: '99.00.123456.12345678',
      labelUrl:       'https://track.post.ch/99.00.123456.12345678',
      labelId:        'mock-abc123def456',
    });

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.generateLabel(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const data = res.json.mock.calls[0][0].data;
    expect(data.trackingNumber).toMatch(/^99\.00\./);
    expect(data.labelUrl).toContain('post.ch');
  });

  test('retourne 404 si commande introuvable', async () => {
    orderRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.generateLabel(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('propage l\'erreur si shippingService lève une exception', async () => {
    orderRepository.findById.mockResolvedValue(fakeOrder);
    shippingService.generateLabel.mockRejectedValue(new Error('API error'));

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.generateLabel(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── downloadLabel() ───────────────────────────────────────────────────────────

describe('shipping.admin.controller — downloadLabel()', () => {
  test('retourne 404 si commande introuvable', async () => {
    orderRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadLabel(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('retourne 404 si aucun label_id sur la commande', async () => {
    orderRepository.findById.mockResolvedValue({ ...fakeOrder, label_id: null });

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadLabel(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('génère un PDF mock si label_id commence par "mock-"', async () => {
    const order = { ...fakeOrder, label_id: 'mock-abc123def456', tracking_number: '99.00.111111.11111111' };
    orderRepository.findById.mockResolvedValue(order);

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadLabel(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('etiquette-')
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('redirige vers label_url si label_id réel (non mock)', async () => {
    const order = {
      ...fakeOrder,
      label_id:  'real-label-id',
      label_url: 'https://label.post.ch/real.pdf',
    };
    orderRepository.findById.mockResolvedValue(order);

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.downloadLabel(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('https://label.post.ch/real.pdf');
  });
});

// ── updateTracking() ──────────────────────────────────────────────────────────

describe('shipping.admin.controller — updateTracking()', () => {
  test('met à jour le numéro de suivi et retourne 200', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const req = { params: { id: '1' }, body: { tracking_number: '99.00.999999.99999999' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateTracking(req, res, next);

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders SET tracking_number'),
      ['99.00.999999.99999999', 1]
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 400 si tracking_number absent', async () => {
    const req = { params: { id: '1' }, body: {} };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateTracking(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si tracking_number est une chaîne vide', async () => {
    const req = { params: { id: '1' }, body: { tracking_number: '   ' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateTracking(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 404 si aucune ligne mise à jour', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);

    const req = { params: { id: '999' }, body: { tracking_number: '99.00.000000.00000001' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateTracking(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('retire les espaces autour du numéro de suivi', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const req = { params: { id: '1' }, body: { tracking_number: '  99.00.111111.11111111  ' } };
    const res = makeRes();
    const next = jest.fn();

    await controller.updateTracking(req, res, next);

    const callArgs = pool.execute.mock.calls[0][1];
    expect(callArgs[0]).toBe('99.00.111111.11111111');
  });
});
