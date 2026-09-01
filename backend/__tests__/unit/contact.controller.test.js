jest.mock('../../services/contact.service', () => ({ send: jest.fn() }));

const contactService = require('../../services/contact.service');
const { send } = require('../../controllers/contact.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe('contact.controller — send()', () => {
  test('délègue au service et retourne succès', async () => {
    contactService.send.mockResolvedValue();
    const req = { body: { name: 'A', email: 'a@b.ch', subject: 'S', message: 'M' } };
    const res = makeRes();
    await send(req, res, jest.fn());

    expect(contactService.send).toHaveBeenCalledWith(req.body);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Message envoyé.' });
  });

  test('propage l\'erreur du service (400 données invalides)', async () => {
    const err = Object.assign(new Error('Données invalides.'), { statusCode: 400 });
    contactService.send.mockRejectedValue(err);
    const req = { body: {} };
    const res = makeRes();
    const next = jest.fn();
    await send(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
