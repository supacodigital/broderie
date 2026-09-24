/* Historique des prix — ticket ADM-21.

   L'ordonnance suisse sur l'indication des prix encadre l'annonce d'un rabais :
   un prix barré doit correspondre à un prix réellement pratiqué. Sans trace des
   changements, la boutique ne peut pas le justifier.

   Ces tests portent sur la règle qui décide d'écrire ou non une ligne — c'est
   elle qui détermine si l'historique est exploitable ou noyé sous les doublons. */

jest.mock('../../config/db', () => ({
  pool: { getConnection: jest.fn(), query: jest.fn(), execute: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo = require('../../repositories/product.admin.repository');

// Connexion de transaction simulée — on observe ce qui est réellement écrit
function makeConnection(previousPrice) {
  const executed = [];
  return {
    executed,
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(async (sql, params) => {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT price_chf, compare_price_chf') && sql.includes('FROM products WHERE id = ?')) {
        return [[previousPrice]];
      }
      return [{ affectedRows: 1 }];
    }),
    query: jest.fn(async () => [[]]),
  };
}

const BASE = {
  categoryId: 1, taxRateId: 1, stock: 5, isActive: true,
  secondaryCategoryIds: [],
};

// Lignes d'historique réellement insérées pendant l'appel
const historyInserts = (connection) =>
  connection.executed.filter(e => e.sql.includes('INSERT INTO product_price_history'));

describe('historique des prix — quand une ligne est écrite (ADM-21)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('enregistre un changement de prix de vente', async () => {
    const connection = makeConnection({ price_chf: '84.50', compare_price_chf: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 99.90, comparePriceChf: null }, { changedBy: 7 });

    const inserts = historyInserts(connection);
    expect(inserts).toHaveLength(1);
    // product_id, ancien prix, ancien barré, nouveau prix, nouveau barré, début promo, fin promo, source, auteur
    expect(inserts[0].params).toEqual([1, 84.5, null, 99.9, null, null, null, 'admin', 7]);
  });

  /* Le point décisif : réenregistrer une fiche sans toucher au prix ne doit rien
     écrire. Sinon la table grossirait à chaque correction de libellé sur 15 000
     articles, et l'historique deviendrait illisible. */
  test("n'écrit rien quand le prix est réenregistré à l'identique", async () => {
    const connection = makeConnection({ price_chf: '84.50', compare_price_chf: '119.00' });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 84.50, comparePriceChf: 119.00 }, { changedBy: 7 });

    expect(historyInserts(connection)).toHaveLength(0);
  });

  /* MySQL renvoie les DECIMAL sous forme de chaînes ('84.50') et le formulaire
     envoie des nombres : sans conversion, '84.50' !== 84.5 déclencherait une
     écriture à chaque enregistrement. */
  test('compare les montants en nombres, pas en chaînes', async () => {
    const connection = makeConnection({ price_chf: '84.50', compare_price_chf: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 84.5, comparePriceChf: null }, { changedBy: 7 });

    expect(historyInserts(connection)).toHaveLength(0);
  });

  // Une mise en promotion ne change que le prix barré : elle doit être tracée.
  test('enregistre une mise en promotion même à prix de vente inchangé', async () => {
    const connection = makeConnection({ price_chf: '84.50', compare_price_chf: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 84.50, comparePriceChf: 119.00 }, { changedBy: 7 });

    const inserts = historyInserts(connection);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual([1, 84.5, null, 84.5, 119, null, null, 'admin', 7]);
  });

  // Un changement passé hors administration n'a pas d'auteur nommé.
  test('accepte un changement sans auteur', async () => {
    const connection = makeConnection({ price_chf: '10.00', compare_price_chf: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 12.00, comparePriceChf: null });

    const inserts = historyInserts(connection);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[8]).toBeNull();
  });

  /* L'historique part dans la même transaction que le prix : les deux doivent
     être écrits ensemble, ou aucun. Un prix modifié sans trace serait pire que
     pas d'historique du tout — il donnerait une fausse confiance. */
  test("écrit l'historique dans la transaction du changement", async () => {
    const connection = makeConnection({ price_chf: '10.00', compare_price_chf: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 12.00, comparePriceChf: null }, { changedBy: 7 });

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    const insertIndex = connection.executed.findIndex(e => e.sql.includes('INSERT INTO product_price_history'));
    const updateIndex = connection.executed.findIndex(e => e.sql.includes('UPDATE products SET'));
    // L'historique suit l'UPDATE, dans la même transaction
    expect(insertIndex).toBeGreaterThan(updateIndex);
  });
});

/* Audit du 24/09 — la période de promotion fait partie de l'offre : c'est elle
   que l'ordonnance sur l'indication des prix contrôle. */
describe('historique des prix — période de promotion (ADM-21)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('enregistre un simple déplacement des dates de promotion', async () => {
    const connection = makeConnection({
      price_chf: '84.50', compare_price_chf: '119.00',
      promo_starts_at: new Date(2026, 9, 1, 0, 0), promo_ends_at: new Date(2026, 9, 15, 23, 59),
    });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, {
      ...BASE, priceChf: 84.5, comparePriceChf: 119,
      promoStartsAt: '2026-10-01 00:00:00', promoEndsAt: '2026-10-31 23:59:00',
    }, { changedBy: 7 });

    const inserts = historyInserts(connection);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual([1, 84.5, 119, 84.5, 119, '2026-10-01 00:00:00', '2026-10-31 23:59:00', 'admin', 7]);
  });

  // MySQL rend une Date, le service une chaîne : la même minute ne doit rien écrire
  test("n'écrit rien quand les dates sont identiques sous deux formats", async () => {
    const connection = makeConnection({
      price_chf: '84.50', compare_price_chf: '119.00',
      promo_starts_at: new Date(2026, 9, 1, 0, 0), promo_ends_at: null,
    });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, {
      ...BASE, priceChf: 84.5, comparePriceChf: 119,
      promoStartsAt: '2026-10-01 00:00:00', promoEndsAt: null,
    }, { changedBy: 7 });

    expect(historyInserts(connection)).toHaveLength(0);
  });

  // Sans prix barré, des dates n'ont aucun effet sur le prix payé
  test('ignore les dates quand il n\'y a pas de prix barré', async () => {
    const connection = makeConnection({ price_chf: '10.00', compare_price_chf: null, promo_starts_at: null, promo_ends_at: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 10, comparePriceChf: null, promoStartsAt: '2026-10-01 00:00:00' }, { changedBy: 7 });

    expect(historyInserts(connection)).toHaveLength(0);
  });
});

describe('historique des prix — création d\'un produit (ADM-21)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('enregistre le prix de départ, sans ancien prix', async () => {
    const connection = makeConnection(null);
    connection.execute.mockImplementation(async (sql, params) => {
      connection.executed.push({ sql, params });
      return [{ insertId: 42, affectedRows: 1 }];
    });
    pool.getConnection.mockResolvedValue(connection);

    await repo.create({
      ...BASE, slug: 'kit-test', priceChf: 25, comparePriceChf: null,
      translations: { fr: { name: 'Kit test' } },
    }, { changedBy: 7 });

    const inserts = historyInserts(connection);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual([42, null, null, 25, null, null, null, 'admin', 7]);
  });
});
