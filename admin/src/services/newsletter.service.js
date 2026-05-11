import api from './api.js'

export async function getSubscribers(params = {}) {
  const res = await api.get('/admin/newsletter', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function unsubscribeSubscriber(id) {
  await api.delete(`/admin/newsletter/${id}`)
}

export async function exportCsv(params = {}) {
  const res = await api.get('/admin/newsletter/export', { params, responseType: 'blob' })
  const url  = URL.createObjectURL(res.data)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'newsletter.csv'
  a.click()
  URL.revokeObjectURL(url)
}
