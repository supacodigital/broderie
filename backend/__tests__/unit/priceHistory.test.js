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
      if (sql.includes('SELECT price_chf, compare_price_chf FROM products')) {
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
    // product_id, ancien prix, ancien barré, nouveau prix, nouveau barré, source, auteur
    expect(inserts[0].params).toEqual([1, 84.5, null, 99.9, null, 'admin', 7]);
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
    expect(inserts[0].params).toEqual([1, 84.5, null, 84.5, 119, 'admin', 7]);
  });

  // Un changement passé hors administration n'a pas d'auteur nommé.
  test('accepte un changement sans auteur', async () => {
    const connection = makeConnection({ price_chf: '10.00', compare_price_chf: null });
    pool.getConnection.mockResolvedValue(connection);

    await repo.update(1, { ...BASE, priceChf: 12.00, comparePriceChf: null });

    const inserts = historyInserts(connection);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[6]).toBeNull();
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
