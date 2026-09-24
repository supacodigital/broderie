import api from './api.js'

/* Suivi des factures QR payées / à payer / en retard (ADM-09) */

export async function getInvoices(params = {}) {
  const res = await api.get('/admin/invoices', { params })
  return {
    data: res.data.data ?? [],
    counts: res.data.counts ?? {},
    dueDays: res.data.dueDays ?? 30,
    pagination: res.data.pagination ?? {},
  }
}

export async function exportInvoicesCsv(status = 'all') {
  const res = await api.get('/admin/invoices/export', { params: { status }, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `factures-${status}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
