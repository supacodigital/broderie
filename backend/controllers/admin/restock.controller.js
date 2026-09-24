const restockService = require('../../services/restock.service');

/* État des réassorts fournisseurs (ADM-09) — lecture seule */

// GET /admin/restock — synthèse par fournisseur
const getSummary = async (req, res, next) => {
  try {
    res.json({ success: true, data: await restockService.getSummary() });
  } catch (error) {
    next(error);
  }
};

// GET /admin/restock/:supplierId — liste à commander (« sans-fournisseur » accepté)
const getSupplierItems = async (req, res, next) => {
  try {
    res.json({ success: true, data: await restockService.getSupplierItems(req.params.supplierId) });
  } catch (error) {
    next(error);
  }
};

// GET /admin/restock/:supplierId/export — CSV à joindre à la commande fournisseur
const exportSupplierCsv = async (req, res, next) => {
  try {
    const { filename, csv } = await restockService.buildSupplierCsv(req.params.supplierId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = { getSummary, getSupplierItems, exportSupplierCsv };
