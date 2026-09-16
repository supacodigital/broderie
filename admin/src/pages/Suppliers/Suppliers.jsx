import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Plus, Edit2, Trash2, Search, Package, X, RotateCcw, Truck } from 'lucide-react'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
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

  /* Tri par colonne — le nom monte par défaut (A→Z), les compteurs descendent
     (le plus gros fournisseur d'abord), ce que l'on cherche en pratique. */
  const handleSort = (col) => {
    if (sortCol === col) {
      setParams({ order: sortDir === 'asc' ? 'desc' : 'asc' })
      return
    }
    setParams({ sort: col, order: col === 'name' ? 'asc' : 'desc' })
  }

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

        {/* Le tri par nom et par nombre de produits se fait désormais en cliquant
            les en-têtes du tableau. Ce sélecteur ne conserve que « Ajout récent »,
            qui n'a pas de colonne dédiée. */}
        <div className={s.toolbarRight}>
          <button
            className={`${s.quickFilter} ${sortCol === 'created_at' ? s.quickFilterOn : ''}`}
            onClick={() => setParams(
              sortCol === 'created_at'
                ? { sort: '', order: '' }
                : { sort: 'created_at', order: 'desc' }
            )}
            aria-pressed={sortCol === 'created_at'}
          >
            Ajout récent
          </button>
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
        <div className={s.card}>
          <div className={s.skeletonWrap}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={s.skeleton} />
            ))}
          </div>
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
        <div className={s.card}>
          <div className={s.tableHead}>
            <button className={s.sortHeader} onClick={() => handleSort('name')}>
              Fournisseur <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} />
            </button>
            <span>Coordonnées</span>
            <button className={s.sortHeader} onClick={() => handleSort('product_count')}>
              Produits <SortIcon col="product_count" sortCol={sortCol} sortDir={sortDir} />
            </button>
            <span>Statut</span>
            <span />
          </div>

          {suppliers.map(sup => {
            const count = sup.product_count ?? 0
            return (
              <div
                key={sup.id}
                className={s.tableRow}
                onClick={() => navigate(`/fournisseurs/${sup.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/fournisseurs/${sup.id}`) }}
              >
                <div className={s.supCell}>
                  <div className={s.supIcon}>{sup.name?.[0]?.toUpperCase() ?? '?'}</div>
                  <span className={s.supName}>{sup.name}</span>
                </div>

                {/* Une seule colonne pour toutes les coordonnées : aucune des 29
                    fiches n'en porte aujourd'hui (elles viennent du fichier
                    catalogue, qui ne donne que les noms). Deux colonnes de tirets
                    prenaient un tiers de la largeur sans rien apprendre ; ici, une
                    fiche incomplète propose directement de la compléter. */}
                {[sup.contact_name, sup.email, sup.phone].some(Boolean) ? (
                  <span className={s.supMeta}>
                    {[sup.contact_name, sup.email, sup.phone].filter(Boolean).join(' · ')}
                  </span>
                ) : (
                  <span className={s.toComplete}>À compléter</span>
                )}

                {/* Le compteur renvoie vers les produits du fournisseur : c'est le
                    geste attendu après avoir repéré une ligne. */}
                <Link
                  className={s.countLink}
                  to={`/produits?supplier_id=${sup.id}`}
                  onClick={e => e.stopPropagation()}
                  data-zero={count === 0 ? 'true' : 'false'}
                  title={`Voir les produits de ${sup.name}`}
                >
                  <Package size={11} />
                  {count.toLocaleString('fr-CH')}
                </Link>

                <span className={s.activeBadge} data-active={String(!!sup.is_active)}>
                  {sup.is_active ? 'Actif' : 'Inactif'}
                </span>

                <div className={s.actions} onClick={e => e.stopPropagation()}>
                  <button
                    className={s.iconBtn}
                    onClick={e => { e.stopPropagation(); navigate(`/fournisseurs/${sup.id}`) }}
                    aria-label={`Modifier ${sup.name}`}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className={s.iconBtnDanger}
                    onClick={e => handleDelete(sup.id, e)}
                    aria-label={`Supprimer ${sup.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
