// Tests unitaires du middleware requireVerifiedEmail

jest.mock('../../repositories/user.repository', () => ({ findById: jest.fn() }));

const userRepository = require('../../repositories/user.repository');
const { requireVerifiedEmail } = require('../../middlewares/requireVerifiedEmail');

beforeEach(() => jest.clearAllMocks());

const run = async (user) => {
  userRepository.findById.mockResolvedValue(user);
  const req = { user: { id: 1 } };
  const next = jest.fn();
  await requireVerifiedEmail(req, {}, next);
  return next;
};

describe('requireVerifiedEmail', () => {
  test('laisse passer si email_verified_at est renseigné', async () => {
    const next = await run({ id: 1, email_verified_at: new Date() });
    expect(next).toHaveBeenCalledWith();
  });

  test('403 si email non vérifié', async () => {
    const next = await run({ id: 1, email_verified_at: null });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('404 si utilisateur introuvable', async () => {
    const next = await run(null);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('propage une erreur inattendue', async () => {
    userRepository.findById.mockRejectedValue(new Error('DB'));
    const req = { user: { id: 1 } };
    const next = jest.fn();
    await requireVerifiedEmail(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
