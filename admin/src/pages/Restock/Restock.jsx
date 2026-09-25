import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Download, Printer, Mail, Phone, Clock } from 'lucide-react'
import { getRestockSummary, getRestockItems, exportRestockCsv } from '../../services/restock.service.js'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Restock.module.css'
import { formatQuantity, formatStock } from '../../utils/stock.js'

/* État des réassorts fournisseurs (ADM-09) — ce qu'il faut commander chez
   chaque fournisseur :
     - les articles « sur commande » attendus par des commandes clientes ;
     - les articles tenus en stock dont le stock est bas.
   Lecture seule : la commande fournisseur se passe comme aujourd'hui, la liste
   s'imprime ou s'exporte pour y être jointe. */

/* Article à la coupe (ADM-12) : stock en centimètres et quantités en tronçons,
   affichés en mètres comme dans la fiche produit. */
const asStockItem = (i) => ({ stock: i.stock, sold_by_length: i.soldByLength, length_step_cm: i.lengthStepCm })

export default function Restock() {
  const toast = useToast()
  const [summary,  setSummary]  = useState([])
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error,    setError]    = useState(false)
  const [exporting, setExporting] = useState(false)

  const loadSummary = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const list = await getRestockSummary()
      setSummary(list)
      // Premier fournisseur (le plus urgent) ouvert d'office
      setSelected(prev => prev ?? list[0]?.supplierId ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  useEffect(() => {
    if (selected === null) return
    let cancelled = false
    setLoadingDetail(true)
    getRestockItems(selected)
      .then(data => { if (!cancelled) setDetail(data) })
      .catch(() => { if (!cancelled) toast.error('La liste de ce fournisseur n’a pas pu être chargée.') })
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [selected, toast])

  const handleExport = async () => {
    if (!detail) return
    setExporting(true)
    try {
      await exportRestockCsv(selected, `reassort-${String(detail.supplier.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`)
    } catch {
      toast.error('L’export n’a pas pu être généré.')
    } finally {
      setExporting(false)
    }
  }

  const supplier = detail?.supplier
  const expected = detail?.items.filter(i => i.orderedQty > 0) ?? []
  // Règle du stock minimum (ADM-09) : un article peut figurer dans les deux listes
  const belowMin = detail?.items.filter(i => i.belowMin) ?? []

  return (
    <div className={s.page}>
      <div className={`${s.pageHead} ${s.noPrint}`}>
        <div>
          <h1 className={s.pageTitle}>Réassort</h1>
          <p className={s.pageSub}>
            Ce qu’il faut commander chez chaque fournisseur : articles attendus par des clientes et articles passés sous leur stock minimum.
          </p>
        </div>
      </div>

      {error && <ErrorBanner onRetry={loadSummary} />}

      <div className={s.layout}>
        <nav className={`${s.suppliers} ${s.noPrint}`} aria-label="Fournisseurs">
          {loading ? (
            [1, 2, 3, 4, 5].map(i => <div key={i} className={s.skeletonSm} />)
          ) : summary.length === 0 ? (
            <p className={s.empty}>Rien à commander pour le moment.</p>
          ) : summary.map(sup => (
            <button
              key={sup.supplierId}
              type="button"
              className={`${s.supplier} ${selected === sup.supplierId ? s.supplierActive : ''}`}
              onClick={() => setSelected(sup.supplierId)}
              aria-current={selected === sup.supplierId ? 'true' : undefined}
            >
              <span className={s.supplierName}>{sup.name}</span>
              <span className={s.supplierCounts}>
                {sup.demandItems > 0 && <span className={s.countExpected}>{sup.demandItems} attendu{sup.demandItems > 1 ? 's' : ''}</span>}
                {sup.belowMinItems > 0 && <span className={s.countLow}>{sup.belowMinItems} sous le minimum</span>}
              </span>
            </button>
          ))}
        </nav>

        <section className={s.panel}>
          {!detail || loadingDetail ? (
            <div className={s.skeleton} />
          ) : (
            <>
              <div className={s.panelHead}>
                <div>
                  <h2 className={s.panelTitle}>{supplier.name}</h2>
                  <div className={s.contact}>
                    {supplier.email && <a href={`mailto:${supplier.email}`}><Mail size={13} /> {supplier.email}</a>}
                    {supplier.phone && <a href={`tel:${supplier.phone}`}><Phone size={13} /> {supplier.phone}</a>}
                    {supplier.customer_number && <span>N° client chez ce fournisseur : <strong>{supplier.customer_number}</strong></span>}
                    {supplier.supply_delay_days && <span><Clock size={13} /> Délai de livraison : {supplier.supply_delay_days} jours</span>}
                  </div>
                </div>
                <div className={`${s.panelActions} ${s.noPrint}`}>
                  <button type="button" className={s.btnGhost} onClick={() => window.print()}>
                    <Printer size={14} /> Imprimer
                  </button>
                  <button type="button" className={s.btnPrimary} onClick={handleExport} disabled={exporting}>
                    <Download size={14} /> {exporting ? 'Export…' : 'Exporter (CSV)'}
                  </button>
                </div>
              </div>

              <h3 className={s.groupTitle}>Attendus par des clientes <span className={s.groupCount}>{expected.length}</span></h3>
              {expected.length === 0 ? (
                <p className={s.groupEmpty}>Aucune commande cliente n’attend d’article de ce fournisseur.</p>
              ) : (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">Référence</th>
                      <th scope="col">Article</th>
                      <th scope="col" className={s.num}>Quantité</th>
                      <th scope="col">Commandes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expected.map(i => (
                      <tr key={i.productId}>
                        <td className={s.sku}>{i.sku ?? '—'}</td>
                        <td>{i.name}</td>
                        <td className={`${s.num} ${s.strong}`}>{formatQuantity(asStockItem(i), i.orderedQty)}</td>
                        <td className={s.orders}>
                          {i.orderIds.map(id => <Link key={id} to={`/commandes/${id}`}>#{id}</Link>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 className={s.groupTitle}>Sous le stock minimum <span className={s.groupCount}>{belowMin.length}</span></h3>
              {belowMin.length === 0 ? (
                <p className={s.groupEmpty}>Aucun article de ce fournisseur n’est sous son stock minimum.</p>
              ) : (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">Référence</th>
                      <th scope="col">Article</th>
                      <th scope="col" className={s.num}>Stock</th>
                      <th scope="col" className={s.num}>Minimum</th>
                      <th scope="col" className={s.num}>À commander</th>
                    </tr>
                  </thead>
                  <tbody>
                    {belowMin.map(i => (
                      <tr key={i.productId}>
                        <td className={s.sku}>{i.sku ?? '—'}</td>
                        <td><Link to={`/produits/${i.productId}`} className={s.productLink}>{i.name}</Link></td>
                        <td className={`${s.num} ${i.stock === 0 ? s.out : ''}`}>{formatStock(asStockItem(i))}</td>
                        <td className={s.num}>{formatStock({ ...asStockItem(i), stock: i.stockMin })}</td>
                        <td className={`${s.num} ${s.strong}`}>{formatStock({ ...asStockItem(i), stock: i.toOrder })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {detail.truncated && <p className={s.groupEmpty}>Liste limitée aux 1 000 premiers articles.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
