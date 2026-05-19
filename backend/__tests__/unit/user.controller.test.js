// Tests unitaires user.controller

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash:    jest.fn(),
}));

jest.mock('../../repositories/user.repository', () => ({
  findById:            jest.fn(),
  findByIdWithPassword: jest.fn(),
  update:              jest.fn(),
  findAddresses:       jest.fn(),
  createAddress:       jest.fn(),
  updateAddress:       jest.fn(),
  deleteAddress:       jest.fn(),
  updatePassword:      jest.fn(),
}));

const bcrypt         = require('bcrypt');
const userRepository = require('../../repositories/user.repository');
const {
  getMe, updateMe, getAddresses,
  createAddress, updateAddress, deleteAddress, changePassword,
} = require('../../controllers/user.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getMe() ───────────────────────────────────────────────────────────────────

describe('user.controller — getMe()', () => {
  test('retourne le profil de l\'utilisateur', async () => {
    const user = { id: 1, email: 'a@b.ch', first_name: 'Marie' };
    userRepository.findById.mockResolvedValue(user);

    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await getMe(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: user });
  });

  test('retourne 404 si utilisateur introuvable', async () => {
    userRepository.findById.mockResolvedValue(null);
    const req = { user: { id: 99 } };
    const res = makeRes();
    const next = jest.fn();
    await getMe(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('appelle next en cas d\'erreur', async () => {
    userRepository.findById.mockRejectedValue(new Error('DB'));
    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await getMe(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── updateMe() ────────────────────────────────────────────────────────────────

describe('user.controller — updateMe()', () => {
  test('met à jour le profil avec la locale fournie', async () => {
    const updated = { id: 1, first_name: 'Marc', locale: 'de' };
    userRepository.update.mockResolvedValue(updated);

    const req = { user: { id: 1 }, body: { firstName: 'Marc', lastName: 'Dupont', locale: 'de' } };
    const res = makeRes();
    const next = jest.fn();

    await updateMe(req, res, next);
    expect(userRepository.update).toHaveBeenCalledWith(1, { firstName: 'Marc', lastName: 'Dupont', locale: 'de' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  test('récupère la locale existante si non fournie', async () => {
    userRepository.findById.mockResolvedValue({ locale: 'fr' });
    userRepository.update.mockResolvedValue({ id: 1, locale: 'fr' });

    const req = { user: { id: 1 }, body: { firstName: 'Marc' } };
    const res = makeRes();
    const next = jest.fn();

    await updateMe(req, res, next);
    expect(userRepository.findById).toHaveBeenCalledWith(1);
    expect(userRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({ locale: 'fr' }));
  });

  test('utilise "fr" comme locale par défaut si utilisateur introuvable', async () => {
    userRepository.findById.mockResolvedValue(null);
    userRepository.update.mockResolvedValue({ id: 1, locale: 'fr' });

    const req = { user: { id: 1 }, body: {} };
    const res = makeRes();
    await updateMe(req, res, jest.fn());
    expect(userRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({ locale: 'fr' }));
  });

  test('accepte snake_case (first_name, last_name)', async () => {
    userRepository.update.mockResolvedValue({});
    const req = { user: { id: 1 }, body: { first_name: 'Alice', last_name: 'Brown', locale: 'en' } };
    const res = makeRes();
    await updateMe(req, res, jest.fn());
    expect(userRepository.update).toHaveBeenCalledWith(1, {
      firstName: 'Alice', lastName: 'Brown', locale: 'en',
    });
  });
});

// ── getAddresses() ────────────────────────────────────────────────────────────

describe('user.controller — getAddresses()', () => {
  test('retourne la liste des adresses', async () => {
    const addresses = [{ id: 1, city: 'Berne' }];
    userRepository.findAddresses.mockResolvedValue(addresses);

    const req = { user: { id: 1 } };
    const res = makeRes();
    await getAddresses(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: addresses });
  });
});

// ── createAddress() ───────────────────────────────────────────────────────────

describe('user.controller — createAddress()', () => {
  test('crée une adresse et retourne 201', async () => {
    userRepository.createAddress.mockResolvedValue(5);
    const newAddr = { id: 5, city: 'Genève' };
    userRepository.findAddresses.mockResolvedValue([newAddr]);

    const req = {
      user: { id: 1 },
      body: { label: 'Maison', street: 'Rue test 1', city: 'Genève', zip: '1200', country: 'CH', canton: 'GE', isDefault: true },
    };
    const res = makeRes();
    await createAddress(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: newAddr });
  });

  test('retourne undefined comme data si adresse non trouvée dans la liste', async () => {
    userRepository.createAddress.mockResolvedValue(99);
    userRepository.findAddresses.mockResolvedValue([{ id: 1 }]);

    const req = { user: { id: 1 }, body: {} };
    const res = makeRes();
    await createAddress(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ── updateAddress() ───────────────────────────────────────────────────────────

describe('user.controller — updateAddress()', () => {
  test('met à jour l\'adresse et retourne les données', async () => {
    userRepository.updateAddress.mockResolvedValue();
    const addr = { id: 3, city: 'Zurich' };
    userRepository.findAddresses.mockResolvedValue([addr]);

    const req = {
      params: { id: '3' },
      user: { id: 1 },
      body: { label: 'Bureau', street: 'Rue 2', city: 'Zurich', zip: '8000', country: 'CH', canton: 'ZH', isDefault: false },
    };
    const res = makeRes();
    await updateAddress(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: addr });
  });

  test('retourne 404 si adresse introuvable après mise à jour', async () => {
    userRepository.updateAddress.mockResolvedValue();
    userRepository.findAddresses.mockResolvedValue([{ id: 1 }]);

    const req = { params: { id: '99' }, user: { id: 1 }, body: {} };
    const res = makeRes();
    const next = jest.fn();
    await updateAddress(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── deleteAddress() ───────────────────────────────────────────────────────────

describe('user.controller — deleteAddress()', () => {
  test('supprime l\'adresse et retourne succès', async () => {
    userRepository.deleteAddress.mockResolvedValue(true);

    const req = { params: { id: '3' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await deleteAddress(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(userRepository.deleteAddress).toHaveBeenCalledWith(3, 1);
  });

  test('retourne 404 si adresse introuvable', async () => {
    userRepository.deleteAddress.mockResolvedValue(false);
    const req = { params: { id: '99' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await deleteAddress(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── changePassword() ──────────────────────────────────────────────────────────

describe('user.controller — changePassword()', () => {
  test('change le mot de passe avec succès', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({
      id: 1, password_hash: '$hash',
    });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('$newhash');
    userRepository.updatePassword.mockResolvedValue();

    const req = {
      user: { id: 1 },
      body: { current_password: 'OldPass1!', new_password: 'NewPass1!' },
    };
    const res = makeRes();
    const next = jest.fn();
    await changePassword(req, res, next);
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass1!', 12);
    expect(userRepository.updatePassword).toHaveBeenCalledWith(1, '$newhash');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 400 si champs manquants', async () => {
    const req = { user: { id: 1 }, body: {} };
    const res = makeRes();
    const next = jest.fn();
    await changePassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si nouveau mot de passe trop court', async () => {
    const req = { user: { id: 1 }, body: { current_password: 'old', new_password: 'short' } };
    const res = makeRes();
    const next = jest.fn();
    await changePassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 404 si utilisateur introuvable', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(null);
    const req = { user: { id: 99 }, body: { current_password: 'oldpass', new_password: 'newpassword' } };
    const res = makeRes();
    const next = jest.fn();
    await changePassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('retourne 400 si compte Google (pas de password_hash)', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 1, password_hash: null });
    const req = { user: { id: 1 }, body: { current_password: 'old', new_password: 'newpassword' } };
    const res = makeRes();
    const next = jest.fn();
    await changePassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 401 si mot de passe actuel incorrect', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 1, password_hash: '$hash' });
    bcrypt.compare.mockResolvedValue(false);
    const req = { user: { id: 1 }, body: { current_password: 'wrong', new_password: 'newpassword' } };
    const res = makeRes();
    const next = jest.fn();
    await changePassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
