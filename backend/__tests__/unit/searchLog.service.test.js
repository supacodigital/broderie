// Tests unitaires searchLog.service — repository mocké

jest.mock('../../repositories/searchLog.repository', () => ({
  incrementNoResult: jest.fn(),
  findNoResults: jest.fn(),
}));

const repo    = require('../../repositories/searchLog.repository');
const service = require('../../services/searchLog.service');

beforeEach(() => jest.clearAllMocks());

describe('searchLog.service — normalizeTerm()', () => {
  test('passe en minuscules et réduit les espaces', () => {
    expect(service.normalizeTerm('  Coton   MOULINÉ  ')).toBe('coton mouliné');
  });

  test('conserve les accents — c\'est le mot réellement cherché', () => {
    expect(service.normalizeTerm('Aïda')).toBe('aïda');
  });

  test('tronque à 100 caractères (longueur de la colonne)', () => {
    expect(service.normalizeTerm('a'.repeat(250))).toHaveLength(100);
  });

  test('accepte une saisie absente sans lever', () => {
    expect(service.normalizeTerm(undefined)).toBe('');
    expect(service.normalizeTerm(null)).toBe('');
  });
});

/* Conformité LPD : une saisie ressemblant à une donnée personnelle ne doit
   jamais être enregistrée. Une cliente qui se trompe de champ de saisie ne
   doit pas laisser ses coordonnées dans la table. */
describe('searchLog.service — containsPersonalData()', () => {
  test.each([
    ['julie.martin@bluewin.ch', 'adresse e-mail'],
    ['+41 79 123 45 67',        'téléphone suisse'],
    ['079 123 45 67',           'téléphone sans préfixe'],
    ['ch93 0076 2011 6238 5295 7', 'IBAN suisse'],
    ['756.1234.5678.97',        'numéro AVS'],
    ['4532015112830366',        'numéro de carte'],
  ])('écarte %s (%s)', (input) => {
    expect(service.containsPersonalData(input)).toBe(true);
  });

  test.each([
    ['coton mouliné',     'terme métier'],
    ['kit point de croix','terme métier'],
    ['dmc 310',           'référence courante'],
    ['pe5860',            'SKU'],
    ['1006-5860',         'SKU à tiret'],
  ])('laisse passer %s (%s)', (input) => {
    expect(service.containsPersonalData(input)).toBe(false);
  });
});

describe('searchLog.service — recordNoResult()', () => {
  test('enregistre un terme normalisé', async () => {
    repo.incrementNoResult.mockResolvedValue();

    const ok = await service.recordNoResult('  Machine À Coudre  ', 'fr');

    expect(ok).toBe(true);
    expect(repo.incrementNoResult).toHaveBeenCalledWith('machine à coudre', 'fr');
  });

  test('n\'enregistre pas une donnée personnelle', async () => {
    const ok = await service.recordNoResult('julie@bluewin.ch', 'fr');

    expect(ok).toBe(false);
    expect(repo.incrementNoResult).not.toHaveBeenCalled();
  });

  test('ignore les saisies trop courtes', async () => {
    expect(await service.recordNoResult('a', 'fr')).toBe(false);
    expect(repo.incrementNoResult).not.toHaveBeenCalled();
  });

  /* La journalisation est une statistique : une base indisponible ne doit jamais
     faire échouer la recherche de la cliente. */
  test('absorbe une erreur de base sans lever', async () => {
    repo.incrementNoResult.mockRejectedValue(new Error('BDD indisponible'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.recordNoResult('tronçonneuse', 'fr')).resolves.toBe(false);

    spy.mockRestore();
  });
});

describe('searchLog.service — getNoResultTerms()', () => {
  test('retourne les termes paginés au format standard', async () => {
    repo.findNoResults.mockResolvedValue({
      rows: [{ id: 1, term: 'tronçonneuse', search_count: 4 }],
      total: 1,
    });

    const result = await service.getNoResultTerms({ page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});
