// Tests unitaires config/swissPostClient — OAuth2 + cache token (fetch mocké)

jest.mock('../../config/swissPost', () => ({
  clientId:     'cid',
  clientSecret: 'secret',
  scope:        'DCAPI_BARCODE_READ',
  tokenUrl:     'https://api.post.ch/OAuth/token',
  labelUrl:     'https://dcapi.apis.post.ch/barcode/v1/generateAddressLabel',
  isMock:       false,
}));

const client = require('../../config/swissPostClient');

/* Réponse fetch simulée */
const okJson = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => '' });
const fail   = (status, body = 'err') => ({ ok: false, status, json: async () => ({}), text: async () => body });

beforeEach(() => {
  client._resetTokenCache();
  global.fetch = jest.fn();
});
afterEach(() => { delete global.fetch; });

describe('swissPostClient — getAccessToken()', () => {
  test('récupère un token et le met en cache (un seul appel réseau pour deux demandes)', async () => {
    global.fetch.mockResolvedValue(okJson({ access_token: 'tok-123', expires_in: 3600 }));

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken(); // doit venir du cache

    expect(t1).toBe('tok-123');
    expect(t2).toBe('tok-123');
    expect(global.fetch).toHaveBeenCalledTimes(1); // pas de 2e appel grâce au cache
  });

  test('envoie grant_type=client_credentials en form-urlencoded', async () => {
    global.fetch.mockResolvedValue(okJson({ access_token: 'tok', expires_in: 3600 }));

    await client.getAccessToken();

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.post.ch/OAuth/token');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(opts.body.toString()).toContain('grant_type=client_credentials');
    expect(opts.body.toString()).toContain('scope=DCAPI_BARCODE_READ');
  });

  test('lève une erreur si le token endpoint répond en échec', async () => {
    global.fetch.mockResolvedValue(fail(401, 'invalid_client'));
    await expect(client.getAccessToken()).rejects.toThrow(/OAuth2 La Poste CH/);
  });
});

describe('swissPostClient — generateAddressLabel()', () => {
  test('appelle l\'endpoint label avec le Bearer token', async () => {
    global.fetch
      .mockResolvedValueOnce(okJson({ access_token: 'tok-xyz', expires_in: 3600 })) // token
      .mockResolvedValueOnce(okJson({ item: [{ identCode: '99...' }] }));            // label

    const out = await client.generateAddressLabel({ foo: 'bar' });

    expect(out.item[0].identCode).toBe('99...');
    const [, labelOpts] = global.fetch.mock.calls[1];
    expect(labelOpts.headers.Authorization).toBe('Bearer tok-xyz');
    expect(labelOpts.method).toBe('POST');
  });

  test('lève une erreur si generateAddressLabel répond en échec', async () => {
    global.fetch
      .mockResolvedValueOnce(okJson({ access_token: 'tok', expires_in: 3600 }))
      .mockResolvedValueOnce(fail(500, 'server error'));

    await expect(client.generateAddressLabel({})).rejects.toThrow(/generateAddressLabel La Poste CH/);
  });
});
