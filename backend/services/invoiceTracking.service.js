const invoiceTrackingRepository = require('../repositories/invoiceTracking.repository');
const { getInvoiceSettings } = require('./shopSettings.service');
const { buildCsv } = require('../utils/csv.utils');
const { roundCHF } = require('../utils/chf.utils');

/* Suivi des factures QR payées / à payer / en retard (ADM-09). L'échéance suit
   le délai réglé dans Paramètres → Facturation, comme sur la facture. */

const STATUSES = ['all', 'unpaid', 'overdue', 'paid'];
const MAX_LIMIT = 100;
const EXPORT_LIMIT = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dueDaysSetting = async () => (await getInvoiceSettings())?.dueDays ?? 30;

const toInvoice = (row, dueDays, now = Date.now()) => {
  const createdAt = new Date(row.created_at);
  const dueDate = new Date(createdAt.getTime() + dueDays * DAY_MS);
  const paid = !!row.paid_at;
  const daysOverdue = paid ? 0 : Math.max(0, Math.floor((now - dueDate.getTime()) / DAY_MS));
  return {
    orderId: row.id,
    invoiceNumber: row.invoice_number,
    qrReference: row.qr_reference,
    createdAt: row.created_at,
    dueDate: dueDate.toISOString(),
    total: roundCHF(parseFloat(row.total)),
    orderStatus: row.status,
    customer: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    email: row.email,
    paidAt: row.paid_at,
    paymentStatus: paid ? 'paid' : daysOverdue > 0 || now > dueDate.getTime() ? 'overdue' : 'unpaid',
    daysOverdue,
  };
};

const normalizeStatus = (status) => (STATUSES.includes(status) ? status : 'all');

const listInvoices = async ({ status, page, limit, q }) => {
  const dueDays = await dueDaysSetting();
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 50));
  const filter = normalizeStatus(status);

  const [{ rows, total }, counts] = await Promise.all([
    invoiceTrackingRepository.findInvoices({ status: filter, dueDays, page: safePage, limit: safeLimit, q: typeof q === 'string' ? q.slice(0, 100) : '' }),
    invoiceTrackingRepository.countByStatus({ dueDays }),
  ]);
  return {
    invoices: rows.map((r) => toInvoice(r, dueDays)),
    counts: {
      all: Number(counts?.total ?? 0),
      unpaid: Number(counts?.unpaid ?? 0),
      overdue: Number(counts?.overdue ?? 0),
      paid: Number(counts?.paid ?? 0),
      outstanding: roundCHF(parseFloat(counts?.outstanding ?? 0)),
    },
    dueDays,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
  };
};

const PAYMENT_LABELS = { paid: 'Payée', unpaid: 'À payer', overdue: 'En retard' };
const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
  : '');

/* Export CSV pour pointer le relevé bancaire : la référence QR est celle que
   la banque indique en face de chaque virement. */
const buildInvoicesCsv = async ({ status }) => {
  const dueDays = await dueDaysSetting();
  const filter = normalizeStatus(status);
  const { rows } = await invoiceTrackingRepository.findInvoices({ status: filter, dueDays, page: 1, limit: EXPORT_LIMIT });
  const headers = ['N° facture', 'Référence QR', 'Date de facture', 'Échéance', 'Cliente', 'E-mail', 'Montant CHF', 'Statut', 'Payée le', 'Jours de retard', 'Commande'];
  const csvRows = rows.map((r) => toInvoice(r, dueDays)).map((i) => [
    i.invoiceNumber ?? '',
    i.qrReference ?? '',
    formatDate(i.createdAt),
    formatDate(i.dueDate),
    i.customer,
    i.email,
    i.total.toFixed(2),
    PAYMENT_LABELS[i.paymentStatus],
    formatDate(i.paidAt),
    i.daysOverdue || '',
    `#${i.orderId}`,
  ]);
  return { filename: `factures-${filter}.csv`, csv: buildCsv(headers, csvRows) };
};

module.exports = { listInvoices, buildInvoicesCsv, toInvoice };
