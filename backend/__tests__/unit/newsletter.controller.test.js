// Tests unitaires admin/newsletter.controller

jest.mock('../../repositories/newsletter.repository', () => ({
  findAll:          jest.fn(),
  unsubscribeById:  jest.fn(),
}));

const newsletterRepository = require('../../repositories/newsletter.repository');
const { getAll, unsubscribe, exportCsv } = require('../../controllers/admin/newsletter.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status     = jest.fn().mockReturnValue(res);
  res.json       = jest.fn().mockReturnValue(res);
  res.setHeader  = jest.fn().mockReturnValue(res);
  res.send       = jest.fn().mockReturnValue(res);
  return res;
}

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('admin/newsletter.controller — getAll()', () => {
  test('retourne les abonnés paginés', async () => {
    const rows = [{ id: 1, email: 'a@b.ch', is_active: 1 }];
    newsletterRepository.findAll.mockResolvedValue({ rows, total: 1 });

    const req = { query: { page: '1', limit: '20' } };
    const res = makeRes();
    await getAll(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: rows,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(newsletterRepository.findAll).toHaveBeenCalledWith({
      page: 1, limit: 20, search: '', active: undefined,
    });
  });

  test('passe le filtre active et search', async () => {
    newsletterRepository.findAll.mockResolvedValue({ rows: [], total: 0 });
    const req = { query: { active: '1', search: 'alice' } };
    const res = makeRes();
    await getAll(req, res, jest.fn());
    expect(newsletterRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ active: '1', search: 'alice' })
    );
  });

  test('applique la limite max de 100', async () => {
    newsletterRepository.findAll.mockResolvedValue({ rows: [], total: 0 });
    const req = { query: { limit: '999' } };
    const res = makeRes();
    await getAll(req, res, jest.fn());
    expect(newsletterRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  test('appelle next en cas d\'erreur', async () => {
    newsletterRepository.findAll.mockRejectedValue(new Error('DB'));
    const req = { query: {} };
    const res = makeRes();
    const next = jest.fn();
    await getAll(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── unsubscribe() ─────────────────────────────────────────────────────────────

describe('admin/newsletter.controller — unsubscribe()', () => {
  test('désabonne et retourne succès', async () => {
    newsletterRepository.unsubscribeById.mockResolvedValue(true);
    const req = { params: { id: '5' } };
    const res = makeRes();
    await unsubscribe(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Abonné désabonné.' });
    expect(newsletterRepository.unsubscribeById).toHaveBeenCalledWith(5);
  });

  test('retourne 404 si abonné introuvable', async () => {
    newsletterRepository.unsubscribeById.mockResolvedValue(false);
    const req = { params: { id: '99' } };
    const res = makeRes();
    await unsubscribe(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Abonné introuvable.' });
  });

  test('appelle next en cas d\'erreur', async () => {
    newsletterRepository.unsubscribeById.mockRejectedValue(new Error('DB'));
    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();
    await unsubscribe(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── exportCsv() ───────────────────────────────────────────────────────────────

describe('admin/newsletter.controller — exportCsv()', () => {
  test('envoie un fichier CSV avec BOM UTF-8', async () => {
    const rows = [
      { id: 1, email: 'a@b.ch', locale: 'fr', is_active: 1, subscribed_at: '2026-01-15T10:00:00.000Z', unsubscribed_at: null },
      { id: 2, email: 'b@c.ch', locale: null,  is_active: 0, subscribed_at: null, unsubscribed_at: '2026-03-01T00:00:00.000Z' },
    ];
    newsletterRepository.findAll.mockResolvedValue({ rows, total: 2 });

    const req = { query: {} };
    const res = makeRes();
    await exportCsv(req, res, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="newsletter.csv"');

    const csv = res.send.mock.calls[0][0];
    // BOM UTF-8 présent
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('a@b.ch');
    expect(csv).toContain('2026-01-15');
    expect(csv).toContain('oui');
    expect(csv).toContain('non');
    // unsubscribed_at formaté
    expect(csv).toContain('2026-03-01');
  });

  test('génère une ligne par abonné', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1, email: `u${i}@b.ch`, locale: 'fr',
      is_active: 1, subscribed_at: null, unsubscribed_at: null,
    }));
    newsletterRepository.findAll.mockResolvedValue({ rows, total: 3 });

    const req = { query: {} };
    const res = makeRes();
    await exportCsv(req, res, jest.fn());

    const csv = res.send.mock.calls[0][0];
    // header + 3 lignes
    const lines = csv.split('\n').filter(Boolean);
    expect(lines).toHaveLength(4); // 1 header + 3 data
  });

  test('appelle next en cas d\'erreur', async () => {
    newsletterRepository.findAll.mockRejectedValue(new Error('DB'));
    const req = { query: {} };
    const res = makeRes();
    const next = jest.fn();
    await exportCsv(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
