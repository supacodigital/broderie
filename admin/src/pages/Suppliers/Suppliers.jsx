import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Edit2, Trash2, Search, Package, X, RotateCcw, Truck } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import { getSuppliers, deleteSupplier } from '../../services/suppliers.service.js'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Suppliers.module.css'

/* ── Page principale ── */
export default function Suppliers() {
  const toast   = useToast()
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [confirm,   setConfirm]   = useState(null)

  /* Recherche, filtre et tri dans l'URL — même raison que sur les autres listes
     de l'admin : revenir d'une fiche fournisseur ne doit pas réinitialiser la
     vue, et un rafraîchissement ne perd rien. */
  const [searchParams, setSearchParams] = useSearchParams()
  const getParam = (key, fallback = '') => searchParams.get(key) ?? fallback

  const setParams = useCallback((changes) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === false || value === null || value === undefined) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const search   = getParam('q')
  const isActive = getParam('is_active')
  const sortCol  = getParam('sort', 'name')
  const sortDir  = getParam('order', 'asc')

  const [searchInput, setSearchInput] = useState(search)
  const debounceRef = useRef(null)
  const handleSearch = (val) => {
    setSearchInput(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setParams({ q: val }), 300)
  }
  useEffect(() => { setSearchInput(search) }, [search])
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const activeFilterCount = [isActive].filter(Boolean).length
  const resetFilters = () => setParams({ is_active: '' })

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 100, sort: sortCol, order: sortDir })
      if (search)   params.set('q', search)
      if (isActive) params.set('is_active', isActive)
      const res = await getSuppliers(Object.fromEntries(params))
      setSuppliers(res.data ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [search, isActive, sortCol, sortDir])

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
            placeholder="Nom, contact ou email…"
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && searchInput) { handleSearch(''); e.currentTarget.blur() } }}
          />
        </div>

        {/* Actifs / inactifs : un fournisseur désactivé reste lié à ses produits,
            il ne disparaît pas — il faut donc pouvoir le retrouver. */}
        <button
          className={`${s.quickFilter} ${isActive === 'true' ? s.quickFilterOn : ''}`}
          onClick={() => setParams({ is_active: isActive === 'true' ? '' : 'true' })}
          aria-pressed={isActive === 'true'}
        >
          Actifs
        </button>
        <button
          className={`${s.quickFilter} ${isActive === 'false' ? s.quickFilterOn : ''}`}
          onClick={() => setParams({ is_active: isActive === 'false' ? '' : 'false' })}
          aria-pressed={isActive === 'false'}
        >
          Inactifs
        </button>

        <div className={s.toolbarRight}>
          <label className={s.sortLabel}>
            Trier par
            <select
              className={s.sortSelect}
              value={`${sortCol}:${sortDir}`}
              onChange={e => {
                const [col, dir] = e.target.value.split(':')
                setParams({ sort: col, order: dir })
              }}
            >
              <option value="name:asc">Nom (A→Z)</option>
              <option value="name:desc">Nom (Z→A)</option>
              <option value="product_count:desc">Nombre de produits</option>
              <option value="created_at:desc">Ajout récent</option>
            </select>
          </label>
        </div>
      </div>

      {(activeFilterCount > 0 || search) && (
        <div className={s.chips}>
          {isActive && (
            <button className={s.chip} onClick={() => setParams({ is_active: '' })}>
              <span className={s.chipLabel}>Statut</span>
              <span className={s.chipValue}>{isActive === 'true' ? 'Actifs' : 'Inactifs'}</span>
              <X size={12} className={s.chipX} />
            </button>
          )}
          {search && (
            <button className={s.chip} onClick={() => handleSearch('')}>
              <span className={s.chipLabel}>Recherche</span>
              <span className={s.chipValue}>{search}</span>
              <X size={12} className={s.chipX} />
            </button>
          )}
          <button className={s.chipReset} onClick={() => { resetFilters(); handleSearch('') }}>
            <RotateCcw size={12} /> Tout effacer
          </button>
        </div>
      )}

      {error && <ErrorBanner onRetry={load} />}

      {loading ? (
        <div className={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={s.skeleton} />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        /* Deux situations distinctes : un filtre trop restrictif, ou un module
           réellement vide. Dans le second cas, la seule action utile est de
           créer un fournisseur — le message seul laissait sans issue. */
        <div className={s.empty}>
          {(search || activeFilterCount > 0) ? (
            <>
              <p className={s.emptyTitle}>Aucun fournisseur ne correspond.</p>
              <p className={s.emptyHint}>
                {search && <>Recherche « <strong>{search}</strong> »</>}
                {search && activeFilterCount > 0 && ' et '}
                {activeFilterCount > 0 && <>filtre sur le statut</>}.
              </p>
              <button className={s.emptyBtn} onClick={() => { resetFilters(); handleSearch('') }}>
                <RotateCcw size={13} /> Effacer les filtres
              </button>
            </>
          ) : (
            <>
              <Truck size={28} className={s.emptyIcon} />
              <p className={s.emptyTitle}>Aucun fournisseur enregistré</p>
              <p className={s.emptyHint}>
                Les fournisseurs se rattachent aux produits et portent les délais
                de réapprovisionnement affichés en boutique.
              </p>
              <button className={s.btnPrimary} onClick={() => navigate('/fournisseurs/nouveau')}>
                <Plus size={16} /> Créer le premier fournisseur
              </button>
            </>
          )}
        </div>
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
