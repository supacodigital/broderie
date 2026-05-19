// Tests unitaires contact.controller

jest.mock('../../config/mailer', () => ({
  sendMail: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  mailFrom:    'shop@broderie.ch',
  mailContact: 'contact@broderie.ch',
}));

const transporter = require('../../config/mailer');
const { send }    = require('../../controllers/contact.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('contact.controller — send()', () => {
  const validBody = {
    name:    'Alice Dupont',
    email:   'alice@test.ch',
    subject: 'Question commande',
    message: 'Bonjour, je souhaite savoir...',
  };

  test('envoie l\'email et retourne succès', async () => {
    transporter.sendMail.mockResolvedValue({});
    const req = { body: validBody };
    const res = makeRes();
    const next = jest.fn();

    await send(req, res, next);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
    const mailCall = transporter.sendMail.mock.calls[0][0];
    expect(mailCall.to).toBe('contact@broderie.ch');
    expect(mailCall.subject).toContain('Question commande');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Message envoyé.' });
  });

  test('retourne 400 si données invalides (email manquant)', async () => {
    const req = { body: { name: 'Alice', subject: 'Test', message: 'Msg' } };
    const res = makeRes();
    const next = jest.fn();
    await send(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Données invalides.' });
    expect(transporter.sendMail).not.toHaveBeenCalled();
  });

  test('retourne 400 si le nom est vide', async () => {
    const req = { body: { ...validBody, name: '' } };
    const res = makeRes();
    await send(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retourne 400 si le message est vide', async () => {
    const req = { body: { ...validBody, message: '' } };
    const res = makeRes();
    await send(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('échappe les caractères HTML dans le nom et le sujet', async () => {
    transporter.sendMail.mockResolvedValue({});
    const req = {
      body: {
        name:    '<script>alert(1)</script>',
        email:   'a@b.ch',
        subject: '<b>XSS</b>',
        message: 'Test',
      },
    };
    const res = makeRes();
    await send(req, res, jest.fn());
    const mailCall = transporter.sendMail.mock.calls[0][0];
    expect(mailCall.html).not.toContain('<script>');
    expect(mailCall.html).toContain('&lt;script&gt;');
  });

  test('retourne 400 si l\'email a un format invalide', async () => {
    const req = { body: { ...validBody, email: 'pas-un-email' } };
    const res = makeRes();
    await send(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('appelle next en cas d\'erreur d\'envoi', async () => {
    transporter.sendMail.mockRejectedValue(new Error('SMTP error'));
    const req = { body: validBody };
    const res = makeRes();
    const next = jest.fn();
    await send(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
