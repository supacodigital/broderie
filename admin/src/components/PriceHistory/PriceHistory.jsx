import { useState, useEffect } from 'react'
import { History, AlertCircle, RotateCw } from 'lucide-react'
import { getPriceHistory } from '../../services/products.service.js'
import s from './PriceHistory.module.css'

/* Historique des prix d'un produit (ADM-21).

   L'ordonnance suisse sur l'indication des prix encadre l'annonce d'un rabais :
   un prix barré doit correspondre à un prix réellement pratiqué. Sans trace des
   changements, la boutique ne peut pas le justifier en cas de contrôle.

   Chargé à la demande, pas à l'ouverture de la fiche : la plupart des passages
   sur un produit ne concernent pas ses prix, et une requête de plus à chaque
   ouverture se paierait sur 15 000 articles. */
export default function PriceHistory({ productId }) {
  const [open,    setOpen]    = useState(false)
  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  // Incrémenté par « Réessayer » — relance l'effet sans refermer le panneau
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open || !productId) return
    let cancelled = false
    setLoading(true)
    setError('')
    getPriceHistory(productId, { limit: 50 })
      .then(res => {
        if (cancelled) return
        setRows(res.data ?? [])
        setTotal(res.pagination?.total ?? 0)
      })
      .catch(() => { if (!cancelled) setError("L'historique n'a pas pu être chargé.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, productId, reloadKey])

  // Produit pas encore créé : aucun historique possible
  if (!productId) return null

  const formatPrice = (v) => (v === null || v === undefined ? '—' : `CHF ${Number(v).toFixed(2)}`)

  const formatDateTime = (v) => new Date(v).toLocaleString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const formatDay = (v) => new Date(v).toLocaleDateString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  /* Chaque ligne décrit l'offre en vigueur À PARTIR de sa date : prix normal,
     prix promotionnel et période. C'est la lecture qu'attend un contrôle au
     titre de l'ordonnance sur l'indication des prix : quel prix était pratiqué,
     et pendant combien de temps un prix barré a été affiché. */
  const offerOf = (row) => {
    const hasPromo = row.new_compare_price_chf !== null && row.new_compare_price_chf !== undefined
    return {
      normal: hasPromo ? row.new_compare_price_chf : row.new_price_chf,
      promo:  hasPromo ? row.new_price_chf : null,
      hasPromo,
    }
  }

  const promoPeriod = (row) => {
    const { promo_starts_at: start, promo_ends_at: end } = row
    if (start && end) return `du ${formatDay(start)} au ${formatDay(end)}`
    if (start)        return `dès le ${formatDay(start)}, sans fin`
    if (end)          return `jusqu'au ${formatDay(end)}`
    return 'sans date de fin'
  }

  /* Origine du changement : une modification venue d'un import n'engage pas la
     même responsabilité qu'une décision saisie à la main. */
  const sourceLabel = (row) => {
    if (row.source === 'initial') return 'Prix initial'
    if (row.source === 'import')  return 'Import du catalogue'
    if (row.source === 'script')  return 'Mise à jour en masse'
    const name = `${row.changed_by_first_name ?? ''} ${row.changed_by_last_name ?? ''}`.trim()
    return name || 'Administration'
  }

  return (
    <section className={s.section}>
      <button
        type="button"
        className={s.toggle}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <History size={15} aria-hidden="true" />
        <span>Historique des prix</span>
        {open && total > 0 && <span className={s.count}>{total}</span>}
      </button>

      {open && (
        <div className={s.panel}>
          {loading && <p className={s.muted}>Chargement…</p>}

          {!loading && error && (
            <div className={s.error} role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{error}</span>
              <button type="button" className={s.retry} onClick={() => setReloadKey(k => k + 1)}>
                <RotateCw size={13} aria-hidden="true" /> Réessayer
              </button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className={s.muted}>Aucun prix enregistré pour ce produit.</p>
          )}

          {!loading && !error && rows.length > 0 && (
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">À partir du</th>
                  <th scope="col">Prix normal</th>
                  <th scope="col">Prix promo</th>
                  <th scope="col">Période de promo</th>
                  <th scope="col">Origine</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const offer = offerOf(row)
                  // Le plus récent en tête : c'est l'offre actuellement en vigueur
                  const isCurrent = index === 0
                  return (
                    <tr key={row.id} className={isCurrent ? s.current : undefined}>
                      <td className={s.date}>
                        {formatDateTime(row.changed_at)}
                        {isCurrent && <span className={s.currentBadge}>En vigueur</span>}
                      </td>
                      <td className={s.price}>{formatPrice(offer.normal)}</td>
                      <td className={s.price}>{offer.hasPromo ? formatPrice(offer.promo) : '—'}</td>
                      <td className={offer.hasPromo && !row.promo_ends_at ? s.noEnd : s.period}>
                        {offer.hasPromo ? promoPeriod(row) : '—'}
                      </td>
                      <td className={s.source}>{sourceLabel(row)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {!loading && !error && total > rows.length && (
            <p className={s.muted}>
              {rows.length} changements les plus récents sur {total}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
