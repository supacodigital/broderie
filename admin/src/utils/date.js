const fmtShort = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtLong  = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: 'long',    year: 'numeric' })
// Heure suisse, quel que soit le fuseau du poste
const fmtDay   = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
const fmtTime  = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })

export function formatDate(iso) {
  if (!iso) return '—'
  return fmtShort.format(new Date(iso))
}

export function formatDateLong(iso) {
  if (!iso) return '—'
  return fmtLong.format(new Date(iso))
}

/* Ancienneté lisible (« aujourd'hui », « hier », « il y a 3 jours », « il y a
   2 mois ») — compte en jours calendaires, pas en tranches de 24 h : une
   commande passée hier soir est « hier », même 14 h plus tard. */
const fmtRelative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const DAY_MS = 24 * 60 * 60 * 1000

export function formatRelativeDays(iso, now = new Date()) {
  if (!iso) return '—'
  const date  = new Date(iso)
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days  = Math.round((start(now) - start(date)) / DAY_MS)
  if (days < 30)  return fmtRelative.format(-days, 'day')
  if (days < 365) return fmtRelative.format(-Math.floor(days / 30), 'month')
  return fmtRelative.format(-Math.floor(days / 365), 'year')
}

// « 25.09.2026 à 16:05 » — heure suisse
export function formatDateTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${fmtDay.format(date)} à ${fmtTime.format(date)}`
}
