import api from './api.js'

/* État des réassorts fournisseurs (ADM-09) */

export async function getRestockSummary() {
  const res = await api.get('/admin/restock')
  return res.data.data ?? []
}

// supplierId : identifiant, ou « sans-fournisseur »
export async function getRestockItems(supplierId) {
  const res = await api.get(`/admin/restock/${supplierId}`)
  return res.data.data ?? null
}

export async function exportRestockCsv(supplierId, filename = 'reassort.csv') {
  const res = await api.get(`/admin/restock/${supplierId}/export`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
