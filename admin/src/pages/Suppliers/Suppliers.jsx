import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Search, Package } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import { getSuppliers, deleteSupplier } from '../../services/suppliers.service.js'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Suppliers.module.css'

/* ── Page principale ── */
export default function Suppliers() {
  const toast   = useToast()
  const navigate = useNavigate()
  const [suppliers,  setSuppliers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [search,     setSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [confirm,    setConfirm]    = useState(null)
  const debounceRef = useRef(null)

  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 100 })
      if (debouncedSearch) params.set('q', debouncedSearch)
      const res = await getSuppliers(Object.fromEntries(params))
      setSuppliers(res.data ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => { load() }, [load])

  const handleDelete = (id, e) => {
    e.stopPropagation()
    setConfirm({
      message: 'Supprimer ce fournisseur ? Les produits liés ne seront pas supprimés.',
      onConfirm: async () => {
        try {
          await deleteSupplier(id)
          setSuppliers(prev => prev.filter(s => s.id !== id))
          toast.success('Fournisseur supprimé.')
        } catch (err) {
          toast.error(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Fournisseurs</h1>
          <p className={s.pageSub}>{suppliers.length} fournisseur{suppliers.length > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => navigate('/fournisseurs/nouveau')}>
          <Plus size={16} /> Nouveau fournisseur
        </button>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher un fournisseur…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <ErrorBanner onRetry={load} />}

      {loading ? (
        <div className={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={s.skeleton} />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <p className={s.empty}>
          {debouncedSearch ? 'Aucun fournisseur trouvé.' : 'Aucun fournisseur enregistré.'}
        </p>
      ) : (
        <div className={s.grid}>
          {suppliers.map(sup => (
            <div
              key={sup.id}
              className={s.supplierCard}
              onClick={() => navigate(`/fournisseurs/${sup.id}`)}
            >
              <div className={s.supHead}>
                <div className={s.supIcon}>{sup.name?.[0]?.toUpperCase() ?? '?'}</div>
                <div className={s.supInfo}>
                  <p className={s.supName}>{sup.name}</p>
                  {sup.contact_name && <p className={s.supContact}>{sup.contact_name}</p>}
                </div>
                <span className={s.activeBadge} data-active={String(!!sup.is_active)}>
                  {sup.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>

              <div className={s.supDetails}>
                {sup.email   && <p className={s.supDetail}><span className={s.supDetailIcon}>@</span>{sup.email}</p>}
                {sup.phone   && <p className={s.supDetail}><span className={s.supDetailIcon}>✆</span>{sup.phone}</p>}
                {sup.address && <p className={s.supDetail}><span className={s.supDetailIcon}>⌖</span>{sup.address}</p>}
              </div>

              {/* Badge nombre de produits */}
              <div className={s.supFooter}>
                <span className={s.productCountBadge}>
                  <Package size={11} />
                  {sup.product_count ?? 0} produit{(sup.product_count ?? 0) !== 1 ? 's' : ''}
                </span>
                <div className={s.supActions} onClick={e => e.stopPropagation()}>
                  <button
                    className={s.iconBtn}
                    onClick={e => { e.stopPropagation(); navigate(`/fournisseurs/${sup.id}`) }}
                    aria-label="Modifier"
                  >
                    <Edit2 size={13} /> Modifier
                  </button>
                  <button
                    className={s.iconBtnDanger}
                    onClick={e => handleDelete(sup.id, e)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
