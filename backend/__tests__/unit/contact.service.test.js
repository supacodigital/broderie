jest.mock('../../services/email.service', () => ({ sendContactMessage: jest.fn() }));

const emailService = require('../../services/email.service');
const contactService = require('../../services/contact.service');

beforeEach(() => jest.clearAllMocks());

const valid = {
  name: 'Alice Dupont', email: 'alice@test.ch',
  subject: 'Question commande', message: 'Bonjour, je souhaite savoir...',
};

describe('contact.service — send()', () => {
  test('valide et délègue à email.service', async () => {
    emailService.sendContactMessage.mockResolvedValue();
    await contactService.send(valid);
    expect(emailService.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice Dupont', email: 'alice@test.ch' })
    );
  });

  test.each([
    ['email manquant', { name: 'A', subject: 'S', message: 'M' }],
    ['email invalide', { ...valid, email: 'pas-un-email' }],
    ['nom vide', { ...valid, name: '' }],
    ['message vide', { ...valid, message: '' }],
    ['nom avec retour ligne (injection en-tête)', { ...valid, name: 'A\r\nBcc: x@y.z' }],
    ['objet avec retour ligne', { ...valid, subject: 'S\nX' }],
  ])('rejette (400) : %s', async (_label, body) => {
    await expect(contactService.send(body)).rejects.toMatchObject({ statusCode: 400 });
    expect(emailService.sendContactMessage).not.toHaveBeenCalled();
  });
});
