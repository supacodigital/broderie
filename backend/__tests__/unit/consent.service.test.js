jest.mock('../../repositories/consent.repository', () => ({ logConsent: jest.fn() }));
jest.mock('../../config/env', () => ({ consentIpPepper: 'test-pepper-32-characters-minimum-xx' }));

const consentRepository = require('../../repositories/consent.repository');
const consentService = require('../../services/consent.service');

beforeEach(() => jest.clearAllMocks());

describe('consent.service — hashIp', () => {
  test('produit un HMAC-SHA-256 (64 hex), déterministe', () => {
    const a = consentService.hashIp('1.2.3.4');
    const b = consentService.hashIp('1.2.3.4');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  test('des IP différentes donnent des hash différents', () => {
    expect(consentService.hashIp('1.2.3.4')).not.toBe(consentService.hashIp('5.6.7.8'));
  });

  test('gère une IP vide', () => {
    expect(consentService.hashIp('')).toMatch(/^[0-9a-f]{64}$/);
    expect(consentService.hashIp(undefined)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('consent.service — record', () => {
  test('hache l\'IP et délègue au repository', async () => {
    consentRepository.logConsent.mockResolvedValue();
    const ok = await consentService.record({
      userId: 5, sessionId: 'sess', rawIp: '9.9.9.9',
      type: 'cookies', accepted: true, version: '1.0',
    });
    expect(ok).toBe(true);
    expect(consentRepository.logConsent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 5, sessionId: 'sess', type: 'cookies', accepted: true, version: '1.0',
      ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  test('retourne false sans throw si le repository échoue', async () => {
    consentRepository.logConsent.mockRejectedValue(new Error('DB down'));
    const ok = await consentService.record({ rawIp: '1.1.1.1', type: 'cookies', accepted: false, version: '1.0' });
    expect(ok).toBe(false);
  });
});
