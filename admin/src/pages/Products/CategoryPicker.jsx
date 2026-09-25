import { useState } from 'react'
import { Search, X } from 'lucide-react'
import s from './CategoryPicker.module.css'

/* Rayons supplémentaires d'un produit (ADM-04).

   54 rayons sur trois niveaux : la grille de cases à cocher précédente mettait
   les sous-rayons « — … » sur plusieurs colonnes, on perdait leur parent de
   vue, et un rayon coché hors de l'écran ne se voyait plus. Ici :
     - les rayons retenus s'affichent en pastilles, retirables d'un clic ;
     - la liste garde l'arborescence (indentation, pas de tirets) ;
     - un filtre la réduit dès qu'on sait ce qu'on cherche. */
export default function CategoryPicker({ categories, selectedIds, onToggle }) {
  const [query, setQuery] = useState('')

  const normalized = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const needle = normalized(query.trim())
  const visible = needle ? categories.filter(c => normalized(c.label).includes(needle)) : categories
  const selected = categories.filter(c => selectedIds.includes(c.id))

  return (
    <div className={s.picker}>
      {selected.length > 0 && (
        <ul className={s.chips} aria-label="Rayons sélectionnés">
          {selected.map(c => (
            <li key={c.id} className={s.chip}>
              <span className={s.chipLabel} title={c.label}>{c.label}</span>
              <button
                type="button"
                className={s.chipRemove}
                onClick={() => onToggle(c.id)}
                aria-label={`Retirer le rayon ${c.label}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={s.searchWrap}>
        <Search size={14} className={s.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={s.search}
          placeholder="Filtrer les rayons…"
          aria-label="Filtrer les rayons"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={s.list}>
        {visible.length === 0 ? (
          <p className={s.empty}>Aucun rayon ne correspond à « {query} ».</p>
        ) : visible.map(c => {
          const checked = selectedIds.includes(c.id)
          return (
            <label
              key={c.id}
              className={`${s.option} ${checked ? s.optionOn : ''}`}
              // L'indentation reste visible pendant un filtrage : on sait où se trouve le rayon
              style={{ '--depth': c.depth }}
              title={c.label}
            >
              <input
                type="checkbox"
                className={s.checkbox}
                checked={checked}
                onChange={() => onToggle(c.id)}
              />
              <span className={s.optionLabel}>{c.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
