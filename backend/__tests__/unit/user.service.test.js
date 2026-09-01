// Tests unitaires user.service — export LPD + suppression/anonymisation de compte

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('../../config/db', () => ({ pool: { execute: jest.fn().mockResolvedValue([[]]) } }));
jest.mock('../../repositories/user.repository');
jest.mock('../../repositories/order.repository');
jest.mock('../../repositories/review.repository');
jest.mock('../../repositories/loyalty.repository');
jest.mock('../../repositories/wishlist.repository');
jest.mock('../../repositories/newsletter.repository');

const bcrypt               = require('bcrypt');
const userRepository       = require('../../repositories/user.repository');
const orderRepository      = require('../../repositories/order.repository');
const reviewRepository     = require('../../repositories/review.repository');
const loyaltyRepository    = require('../../repositories/loyalty.repository');
const wishlistRepository   = require('../../repositories/wishlist.repository');
const newsletterRepository = require('../../repositories/newsletter.repository');
const userService          = require('../../services/user.service');

beforeEach(() => {
  jest.clearAllMocks();
  orderRepository.findAllByUserIdWithItems.mockResolvedValue([]);
  reviewRepository.findByUserId.mockResolvedValue([]);
  loyaltyRepository.findAccount.mockResolvedValue(null);
  loyaltyRepository.findRewards.mockResolvedValue([]);
  loyaltyRepository.findTransactions.mockResolvedValue([]);
  wishlistRepository.findByUser.mockResolvedValue([]);
  userRepository.findAddresses.mockResolvedValue([]);
  newsletterRepository.findByEmail.mockResolvedValue(null);
});

// ── exportUserData() ──────────────────────────────────────────────────────────

describe('user.service — exportUserData()', () => {
  test('404 si le compte est introuvable', async () => {
    userRepository.findByIdRaw.mockResolvedValue(null);
    await expect(userService.exportUserData(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('assemble le profil et les sections liées', async () => {
    userRepository.findByIdRaw.mockResolvedValue({
      id: 1, email: 'a@b.ch', first_name: 'Marie', last_name: 'D', locale: 'fr',
      role: 'client', google_id: null, avatar_url: null, email_verified_at: null, created_at: new Date(),
    });
    orderRepository.findAllByUserIdWithItems.mockResolvedValue([{ id: 10, items: [], status_history: [] }]);
    loyaltyRepository.findAccount.mockResolvedValue({ total_spend_chf: '120.00' });
    newsletterRepository.findByEmail.mockResolvedValue({ email: 'a@b.ch', is_active: 1 });

    const data = await userService.exportUserData(1);

    expect(data.profile.email).toBe('a@b.ch');
    expect(data.profile.account_type).toBe('password');
    expect(data.orders).toHaveLength(1);
    expect(data.loyalty.account.total_spend_chf).toBe('120.00');
    expect(data.newsletter.is_active).toBe(1);
    expect(data.export_metadata.legal_basis).toMatch(/LPD art\. 25/);
  });

  test('account_type = google si google_id présent', async () => {
    userRepository.findByIdRaw.mockResolvedValue({
      id: 2, email: 'g@b.ch', first_name: 'G', last_name: 'X', locale: 'fr',
      role: 'client', google_id: 'goog-123', avatar_url: null, email_verified_at: new Date(), created_at: new Date(),
    });
    const data = await userService.exportUserData(2);
    expect(data.profile.account_type).toBe('google');
    expect(data.newsletter).toBeNull();
  });
});

// ── deleteAccount() ───────────────────────────────────────────────────────────

describe('user.service — deleteAccount()', () => {
  test('404 si le compte est introuvable', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue(null);
    await expect(userService.deleteAccount(1, { password: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('compte classique : 400 si aucun mot de passe fourni', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 1, password_hash: '$h' });
    await expect(userService.deleteAccount(1, {})).rejects.toMatchObject({ statusCode: 400 });
  });

  test('compte classique : 401 si mot de passe faux', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 1, password_hash: '$h' });
    bcrypt.compare.mockResolvedValue(false);
    await expect(userService.deleteAccount(1, { password: 'wrong' })).rejects.toMatchObject({ statusCode: 401 });
  });

  test('compte classique : anonymise + désabonne la newsletter', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 1, password_hash: '$h' });
    bcrypt.compare.mockResolvedValue(true);
    userRepository.findByIdRaw.mockResolvedValue({ id: 1, role: 'client' });
    userRepository.anonymizeUser.mockResolvedValue({ anonymized: true, email: 'a@b.ch' });
    newsletterRepository.unsubscribe.mockResolvedValue(true);

    await userService.deleteAccount(1, { password: 'good' });

    expect(userRepository.anonymizeUser).toHaveBeenCalledWith(1);
    expect(newsletterRepository.unsubscribe).toHaveBeenCalledWith('a@b.ch');
  });

  test('compte Google : 400 si la confirmation n\'est pas exactement SUPPRIMER', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 3, password_hash: null });
    await expect(userService.deleteAccount(3, { confirm: 'oui' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('compte Google : anonymise si confirm === SUPPRIMER', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 3, password_hash: null });
    userRepository.findByIdRaw.mockResolvedValue({ id: 3, role: 'client' });
    userRepository.anonymizeUser.mockResolvedValue({ anonymized: true, email: 'g@b.ch' });
    newsletterRepository.unsubscribe.mockResolvedValue(false);

    await userService.deleteAccount(3, { confirm: 'SUPPRIMER' });
    expect(userRepository.anonymizeUser).toHaveBeenCalledWith(3);
  });

  test('403 pour un compte admin, sans anonymisation', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 9, password_hash: '$h' });
    bcrypt.compare.mockResolvedValue(true);
    userRepository.findByIdRaw.mockResolvedValue({ id: 9, role: 'admin' });

    await expect(userService.deleteAccount(9, { password: 'good' })).rejects.toMatchObject({ statusCode: 403 });
    expect(userRepository.anonymizeUser).not.toHaveBeenCalled();
  });

  test('404 si anonymizeUser signale un compte déjà supprimé', async () => {
    userRepository.findByIdWithPassword.mockResolvedValue({ id: 1, password_hash: '$h' });
    bcrypt.compare.mockResolvedValue(true);
    userRepository.findByIdRaw.mockResolvedValue({ id: 1, role: 'client' });
    userRepository.anonymizeUser.mockResolvedValue({ alreadyDeleted: true });

    await expect(userService.deleteAccount(1, { password: 'good' })).rejects.toMatchObject({ statusCode: 404 });
  });
});
