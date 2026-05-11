const customerRepository = require('../../repositories/customer.admin.repository');

const getAll = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.q || '';
    const sort   = req.query.sort || 'created_at';
    const order  = req.query.order || 'desc';

    const { rows, total } = await customerRepository.findAll({ page, limit, search, sort, order });

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await customerRepository.findById(parseInt(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Client introuvable.' });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById };
