const fmtDate     = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: 'long',    year: 'numeric' })
const fmtDatetime = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function formatDate(iso) {
  if (!iso) return '—'
  return fmtDate.format(new Date(iso))
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return fmtDatetime.format(new Date(iso))
}
