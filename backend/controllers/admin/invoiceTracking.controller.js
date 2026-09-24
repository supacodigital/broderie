const invoiceTrackingService = require('../../services/invoiceTracking.service');

/* Suivi des factures QR payées / à payer / en retard (ADM-09) */

// GET /admin/invoices?status=all|unpaid|overdue|paid&page=&limit=
const list = async (req, res, next) => {
  try {
    const { invoices, counts, dueDays, pagination } = await invoiceTrackingService.listInvoices(req.query);
    res.json({ success: true, data: invoices, counts, dueDays, pagination });
  } catch (error) {
    next(error);
  }
};

// GET /admin/invoices/export?status= — CSV pour pointer le relevé bancaire
const exportCsv = async (req, res, next) => {
  try {
    const { filename, csv } = await invoiceTrackingService.buildInvoicesCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = { list, exportCsv };
