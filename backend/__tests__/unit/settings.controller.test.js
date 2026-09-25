// Tests unitaires admin/settings.controller

jest.mock('../../repositories/settings.repository', () => ({
  findAllTaxRates:      jest.fn(),
  updateTaxRate:        jest.fn(),
  updateTaxRatesBulk:   jest.fn(),
  findAllShippingRates: jest.fn(),
  replaceShippingRates: jest.fn(),
  findSettings:         jest.fn(),
  upsertSettings:       jest.fn(),
  STORE_KEYS: ['store_name', 'store_email'],
  LEGAL_KEYS: ['cgv', 'privacy'],
  ABOUT_KEYS: ['about_title', 'about_who', 'about_signature'],
  BANNER_KEYS: ['banner_enabled', 'banner_text', 'banner_link'],
}));

jest.mock('../../config/cache', () => ({
  cache: {
    keys: jest.fn().mockReturnValue([]),
    del:  jest.fn(),
  },
}));

const settingsRepository = require('../../repositories/settings.repository');
const { cache }          = require('../../config/cache');

const {
  getTaxRates, updateTaxRates,
  getShippingRates, updateShippingRates,
  getStoreSettings, updateStoreSettings,
  getLegalSettings, updateLegalSettings,
  getAboutSettings, updateAboutSettings,
  updateBannerSettings,
} = require('../../controllers/admin/settings.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getTaxRates() ─────────────────────────────────────────────────────────────

describe('admin/settings.controller — getTaxRates()', () => {
  test('retourne la liste des taux TVA', async () => {
    const rates = [{ id: 1, name: 'Standard', rate: 8.1 }];
    settingsRepository.findAllTaxRates.mockResolvedValue(rates);

    const req = {};
    const res = makeRes();
    await getTaxRates(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rates });
  });

  test('appelle next en cas d\'erreur', async () => {
    settingsRepository.findAllTaxRates.mockRejectedValue(new Error('DB'));
    const next = jest.fn();
    await getTaxRates({}, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── updateTaxRates() ──────────────────────────────────────────────────────────

describe('admin/settings.controller — updateTaxRates()', () => {
  test('met à jour les taux et invalide le cache', async () => {
    settingsRepository.updateTaxRatesBulk.mockResolvedValue();
    const updated = [{ id: 1, rate: 9.0 }];
    settingsRepository.findAllTaxRates.mockResolvedValue(updated);
    cache.keys.mockReturnValue(['tax_rates:all']);

    const req = { body: { rates: [{ id: 1, rate: 9.0 }] } };
    const res = makeRes();
    await updateTaxRates(req, res, jest.fn());
    // Grille appliquée en bloc (transaction) — plus ligne par ligne
    expect(settingsRepository.updateTaxRatesBulk).toHaveBeenCalledWith([{ id: 1, rate: 9.0 }]);
    expect(cache.del).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  test('retourne 400 si rates n\'est pas un tableau', async () => {
    const req = { body: { rates: null } };
    const res = makeRes();
    const next = jest.fn();
    await updateTaxRates(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si rates est un tableau vide', async () => {
    const req = { body: { rates: [] } };
    const res = makeRes();
    const next = jest.fn();
    await updateTaxRates(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('ignore les entrées sans id ou sans rate', async () => {
    settingsRepository.findAllTaxRates.mockResolvedValue([]);
    const req = { body: { rates: [{ id: 0, rate: null }, { rate: 5 }] } };
    const res = makeRes();
    await updateTaxRates(req, res, jest.fn());
    expect(settingsRepository.updateTaxRate).not.toHaveBeenCalled();
  });
});

// ── getShippingRates() ────────────────────────────────────────────────────────

describe('admin/settings.controller — getShippingRates()', () => {
  test('retourne la liste des frais de port', async () => {
    const rates = [{ id: 1, price_chf: 8.5 }];
    settingsRepository.findAllShippingRates.mockResolvedValue(rates);
    const res = makeRes();
    await getShippingRates({}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rates });
  });
});

// ── updateShippingRates() ─────────────────────────────────────────────────────

describe('admin/settings.controller — updateShippingRates()', () => {
  test('retourne 400 si rates manquant', async () => {
    const req = { body: {} };
    const res = makeRes();
    const next = jest.fn();
    await updateShippingRates(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ── getStoreSettings() ────────────────────────────────────────────────────────

describe('admin/settings.controller — getStoreSettings()', () => {
  test('retourne les paramètres du magasin', async () => {
    const data = { store_name: 'Broderie CH', store_email: 'shop@broderie.ch' };
    settingsRepository.findSettings.mockResolvedValue(data);
    const res = makeRes();
    await getStoreSettings({}, res, jest.fn());
    expect(settingsRepository.findSettings).toHaveBeenCalledWith(['store_name', 'store_email']);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
  });
});

// ── updateStoreSettings() ─────────────────────────────────────────────────────

describe('admin/settings.controller — updateStoreSettings()', () => {
  test('filtre les clés autorisées et met à jour', async () => {
    settingsRepository.upsertSettings.mockResolvedValue();
    settingsRepository.findSettings.mockResolvedValue({ store_name: 'Nouveau Nom' });

    const req = { body: { store_name: 'Nouveau Nom', hacked_key: 'evil' } };
    const res = makeRes();
    await updateStoreSettings(req, res, jest.fn());
    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ store_name: 'Nouveau Nom' });
  });
});

// ── getLegalSettings() ────────────────────────────────────────────────────────

describe('admin/settings.controller — getLegalSettings()', () => {
  test('retourne les paramètres légaux', async () => {
    const data = { cgv: 'Texte CGV', privacy: 'Politique' };
    settingsRepository.findSettings.mockResolvedValue(data);
    const res = makeRes();
    await getLegalSettings({}, res, jest.fn());
    expect(settingsRepository.findSettings).toHaveBeenCalledWith(['cgv', 'privacy']);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
  });
});

// ── updateLegalSettings() ─────────────────────────────────────────────────────

describe('admin/settings.controller — updateLegalSettings()', () => {
  test('filtre les clés légales autorisées et met à jour', async () => {
    settingsRepository.upsertSettings.mockResolvedValue();
    settingsRepository.findSettings.mockResolvedValue({ cgv: 'Nouveau CGV' });

    const req = { body: { cgv: 'Nouveau CGV', other: 'ignored' } };
    const res = makeRes();
    await updateLegalSettings(req, res, jest.fn());
    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ cgv: 'Nouveau CGV' });
  });
});

// ── updateBannerSettings() ────────────────────────────────────────────────────
// Non-régression : le lien du bandeau ne doit jamais pouvoir sortir du site.
// Une validation par liste de caractères laissait passer « //evil.com » — chaîne
// composée uniquement de caractères licites dans un chemin et commençant bien par
// « / », mais lue par les navigateurs comme une URL protocole-relative.

describe('admin/settings.controller — updateBannerSettings()', () => {
  const saveLink = async (banner_link) => {
    settingsRepository.findSettings.mockResolvedValue({});
    const req = { body: { banner_link } };
    const res = makeRes();
    await updateBannerSettings(req, res, jest.fn());
    return res;
  };

  test.each([
    ['//evil.com',           'protocole-relative'],
    ['///evil.com',          'triple slash'],
    ['//evil.com/promo',     'protocole-relative avec chemin'],
    ['https://evil.com',     'URL absolue'],
    ['javascript:alert(1)',  'pseudo-protocole javascript'],
    ['/\\evil.com',          'antislash interprété comme slash'],
  ])('refuse un lien externe : %s (%s)', async (link) => {
    const res = await saveLink(link);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(settingsRepository.upsertSettings).not.toHaveBeenCalled();
  });

  test.each([
    ['/catalogue',           '/catalogue'],
    ['/catalogue?cat=kits',  '/catalogue?cat=kits'],
    ['/produits/12#avis',    '/produits/12#avis'],
    // Une saisie sans « / » initial est normalisée plutôt que refusée
    ['catalogue',            '/catalogue'],
  ])('accepte un lien interne : %s', async (link, expected) => {
    await saveLink(link);
    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ banner_link: expected });
  });

  test('normalise banner_enabled en « 1 » ou « 0 »', async () => {
    settingsRepository.findSettings.mockResolvedValue({});
    const res = makeRes();
    await updateBannerSettings({ body: { banner_enabled: true } }, res, jest.fn());
    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ banner_enabled: '1' });

    jest.clearAllMocks();
    settingsRepository.findSettings.mockResolvedValue({});
    await updateBannerSettings({ body: { banner_enabled: 'nimporte quoi' } }, makeRes(), jest.fn());
    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ banner_enabled: '0' });
  });

  test('refuse un texte trop long', async () => {
    settingsRepository.findSettings.mockResolvedValue({});
    const res = makeRes();
    await updateBannerSettings({ body: { banner_text: 'x'.repeat(201) } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(settingsRepository.upsertSettings).not.toHaveBeenCalled();
  });
});


// ── Page « Notre Histoire » (ADM-08) ─────────────────────────────────────────

describe('admin/settings.controller — getAboutSettings()', () => {
  test('retourne le contenu éditable de la page', async () => {
    settingsRepository.findSettings.mockResolvedValue({ about_title: 'Qui sommes-nous ?' });

    const res = makeRes();
    await getAboutSettings({}, res, jest.fn());

    expect(settingsRepository.findSettings).toHaveBeenCalledWith(settingsRepository.ABOUT_KEYS);
    expect(res.json).toHaveBeenCalledWith({
      success: true, data: { about_title: 'Qui sommes-nous ?' },
    });
  });
});

describe('admin/settings.controller — updateAboutSettings()', () => {
  test('enregistre les champs fournis et ignore les clés inconnues', async () => {
    settingsRepository.upsertSettings.mockResolvedValue();
    settingsRepository.findSettings.mockResolvedValue({ about_title: 'Notre maison' });

    const req = { body: { about_title: 'Notre maison', cgv: 'PIRATE', inconnu: 'x' } };
    const res = makeRes();
    await updateAboutSettings(req, res, jest.fn());

    // Seules les clés de la page passent : un champ légal glissé ici est ignoré
    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ about_title: 'Notre maison' });
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  /* Un champ vide est une valeur valide : c'est ainsi que la cliente revient au
     texte d'origine de la boutique. */
  test('accepte un champ vidé', async () => {
    settingsRepository.upsertSettings.mockResolvedValue();
    settingsRepository.findSettings.mockResolvedValue({});

    const res = makeRes();
    await updateAboutSettings({ body: { about_title: '' } }, res, jest.fn());

    expect(settingsRepository.upsertSettings).toHaveBeenCalledWith({ about_title: '' });
  });

  test('refuse une valeur qui n’est pas du texte', async () => {
    const res = makeRes();
    await updateAboutSettings({ body: { about_title: { piège: true } } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(settingsRepository.upsertSettings).not.toHaveBeenCalled();
  });

  test('refuse un texte dépassant la longueur maximale', async () => {
    const res = makeRes();
    await updateAboutSettings({ body: { about_who: 'a'.repeat(50001) } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(settingsRepository.upsertSettings).not.toHaveBeenCalled();
  });
});

/* ADM-10 — grille par montant des articles, réglée par la cliente */
describe('admin/settings.controller — updateShippingRates() grille par montant', () => {
  const run = async (rates) => {
    const res = makeRes();
    const next = jest.fn();
    settingsRepository.findAllShippingRates.mockResolvedValue([]);
    await updateShippingRates({ body: { rates } }, res, next);
    return { res, next };
  };

  test('remplace la grille, tranches triées par montant, « au-delà » en dernier', async () => {
    cache.keys.mockReturnValue(['shipping:all']);
    await run([
      { maxAmountChf: null, priceChf: 15, estimatedDays: '1-2' },
      { maxAmountChf: 100, priceChf: 12, estimatedDays: '1-2' },
      { maxAmountChf: 50, priceChf: 9, estimatedDays: '1-2' },
    ]);
    expect(settingsRepository.replaceShippingRates).toHaveBeenCalledWith([
      { maxAmountChf: 50, priceChf: 9, estimatedDays: '1-2' },
      { maxAmountChf: 100, priceChf: 12, estimatedDays: '1-2' },
      { maxAmountChf: null, priceChf: 15, estimatedDays: '1-2' },
    ]);
    expect(cache.del).toHaveBeenCalled();
  });

  test('une seule tranche sans plafond : forfait accepté', async () => {
    const { res } = await run([{ maxAmountChf: null, priceChf: 9, estimatedDays: '' }]);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(settingsRepository.replaceShippingRates).toHaveBeenCalledWith([{ maxAmountChf: null, priceChf: 9, estimatedDays: null }]);
  });

  test.each([
    ['deux tranches au même plafond', [{ maxAmountChf: 50, priceChf: 5 }, { maxAmountChf: 50, priceChf: 6 }, { maxAmountChf: null, priceChf: 7 }]],
    ['aucune tranche « au-delà »', [{ maxAmountChf: 50, priceChf: 5 }]],
    ['deux tranches « au-delà »', [{ maxAmountChf: null, priceChf: 5 }, { maxAmountChf: null, priceChf: 6 }]],
    ['plafond nul', [{ maxAmountChf: 0, priceChf: 5 }, { maxAmountChf: null, priceChf: 6 }]],
    ['tarif négatif', [{ maxAmountChf: null, priceChf: -1 }]],
    ['tarif absent', [{ maxAmountChf: null, priceChf: '' }]],
    ['tarif à CHF 0 (livraison gratuite interdite)', [{ maxAmountChf: 50, priceChf: 5 }, { maxAmountChf: null, priceChf: 0 }]],
    ['plus de 12 tranches', [...Array.from({ length: 12 }, (_, i) => ({ maxAmountChf: (i + 1) * 10, priceChf: 5 })), { maxAmountChf: null, priceChf: 9 }]],
  ])('refuse (400) : %s', async (_, rates) => {
    const { res } = await run(rates);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(settingsRepository.replaceShippingRates).not.toHaveBeenCalled();
  });
});
