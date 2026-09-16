import { useEffect, useState, useCallback } from 'react'
import { SearchX, RefreshCw } from 'lucide-react'
import { getNoResultSearches } from '../../services/searchLogs.service.js'
import s from './NoResultSearches.module.css'

/* Recherches restées sans résultat en boutique.

   Ce que ça permet de décider : un terme qui revient souvent signale soit une
   référence absente du catalogue, soit un mot du métier qui ne figure dans
   aucune fiche produit — deux ventes manquées, pour deux corrections
   différentes. Sans cette liste, ces recherches étaient invisibles.

   Aucune donnée personnelle n'est affichée ni stockée : la table ne contient
   que le terme et son nombre d'occurrences. */

const TERMS_SHOWN = 8

export default function NoResultSearches() {
  const [terms,   setTerms]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    getNoResultSearches({ limit: TERMS_SHOWN })
      .then(res => setTerms(res.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <section className={s.card}>
      <div className={s.head}>
        <h2 className={s.title}>
          <SearchX size={16} aria-hidden="true" />
          Recherches sans résultat
        </h2>
        <button
          className={s.refresh}
          onClick={load}
          disabled={loading}
          aria-label="Actualiser la liste"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <p className={s.hint}>
        Ce que vos clientes cherchent sans rien trouver — une référence à ajouter,
        ou un mot à faire figurer dans les fiches produit.
      </p>

      {loading && (
        <ul className={s.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className={s.skeleton} />
          ))}
        </ul>
      )}

      {!loading && error && (
        <div className={s.empty}>
          <p>Chargement impossible.</p>
          <button className={s.retry} onClick={load}>Réessayer</button>
        </div>
      )}

      {!loading && !error && terms.length === 0 && (
        <p className={s.empty}>
          Aucune recherche infructueuse pour le moment — bon signe.
        </p>
      )}

      {!loading && !error && terms.length > 0 && (
        <ul className={s.list}>
          {terms.map(item => (
            <li key={item.id} className={s.row}>
              <span className={s.term}>{item.term}</span>
              <span className={s.count}>
                {item.search_count}
                <span className={s.countUnit}>
                  {item.search_count > 1 ? ' recherches' : ' recherche'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
