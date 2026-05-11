const newsletterRepository = require('../../repositories/newsletter.repository');

const getAll = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.search?.trim() ?? '';
    const active = req.query.active; // '1', '0', ou undefined (= tous)

    const { rows, total } = await newsletterRepository.findAll({ page, limit, search, active });

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const unsubscribe = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const removed = await newsletterRepository.unsubscribeById(id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Abonné introuvable.' });
    }
    res.json({ success: true, message: 'Abonné désabonné.' });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const search = req.query.search?.trim() ?? '';
    const active = req.query.active;
    const { rows } = await newsletterRepository.findAll({ page: 1, limit: 100000, search, active });

    const header = 'id,email,locale,actif,inscrit_le,desabonne_le\n';
    const body   = rows.map(r => [
      r.id,
      r.email,
      r.locale ?? '',
      r.is_active ? 'oui' : 'non',
      r.subscribed_at   ? new Date(r.subscribed_at).toISOString().slice(0, 10)   : '',
      r.unsubscribed_at ? new Date(r.unsubscribed_at).toISOString().slice(0, 10) : '',
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="newsletter.csv"');
    res.send('﻿' + header + body); // BOM UTF-8 pour Excel
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, unsubscribe, exportCsv };
