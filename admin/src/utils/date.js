const fmtShort = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtLong  = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: 'long',    year: 'numeric' })

export function formatDate(iso) {
  if (!iso) return '—'
  return fmtShort.format(new Date(iso))
}

export function formatDateLong(iso) {
  if (!iso) return '—'
  return fmtLong.format(new Date(iso))
}
