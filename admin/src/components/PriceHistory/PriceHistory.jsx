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

  const formatDate = (v) => new Date(v).toLocaleString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  /* Origine du changement : une modification venue d'un import n'engage pas la
     même responsabilité qu'une décision saisie à la main. */
  const sourceLabel = (row) => {
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
            <p className={s.muted}>
              Aucun changement de prix enregistré depuis la mise en place du suivi.
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Prix de vente</th>
                  <th scope="col">Prix barré</th>
                  <th scope="col">Origine</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className={s.date}>{formatDate(row.changed_at)}</td>
                    <td>
                      <span className={s.oldValue}>{formatPrice(row.old_price_chf)}</span>
                      <span className={s.arrow} aria-hidden="true">→</span>
                      <span className={s.newValue}>{formatPrice(row.new_price_chf)}</span>
                    </td>
                    <td>
                      <span className={s.oldValue}>{formatPrice(row.old_compare_price_chf)}</span>
                      <span className={s.arrow} aria-hidden="true">→</span>
                      <span className={s.newValue}>{formatPrice(row.new_compare_price_chf)}</span>
                    </td>
                    <td className={s.source}>{sourceLabel(row)}</td>
                  </tr>
                ))}
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
