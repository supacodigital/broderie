import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import s from './Pagination.module.css'

/* Fenêtre de numéros autour de la page courante.
   Sur le catalogue (≈ 775 pages à 20 par page), afficher toutes les pages est
   impossible : on garde toujours la première et la dernière — les deux
   destinations les plus demandées — plus quelques voisines, et on signale les
   ruptures par « … ». */
const buildPages = (page, totalPages, radius = 1) => {
  const pages = new Set([1, totalPages])
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)

  const withGaps = []
  let previous = 0
  for (const p of sorted) {
    if (previous && p - previous > 1) withGaps.push({ gap: true, key: `gap-${p}` })
    withGaps.push({ page: p, key: p })
    previous = p
  }
  return withGaps
}

/**
 * Pagination — numéros cliquables, sauts aux extrémités et saisie directe.
 *
 * @param {number}   page        - page courante (1-indexée)
 * @param {number}   totalPages  - nombre total de pages
 * @param {Function} onPageChange
 * @param {number}   [total]     - nombre total d'éléments ; affiche « x–y sur n »
 * @param {number}   [perPage]   - éléments par page, requis pour ce même libellé
 */
export default function Pagination({ page, totalPages, onPageChange, total = null, perPage = null }) {
  if (totalPages <= 1) return null

  const go = (p) => onPageChange(Math.min(totalPages, Math.max(1, p)))

  /* Saisie directe : sur des centaines de pages, cliquer « suivant » des dizaines
     de fois n'est pas une option. Validation à Entrée uniquement, pour ne pas
     naviguer à chaque chiffre tapé (« 1 » avant « 12 »). */
  const handleJump = (e) => {
    if (e.key !== 'Enter') return
    const value = parseInt(e.target.value, 10)
    if (Number.isInteger(value)) go(value)
    e.target.value = ''
    e.target.blur()
  }

  const from = total !== null && perPage ? (page - 1) * perPage + 1 : null
  const to   = total !== null && perPage ? Math.min(page * perPage, total) : null

  return (
    <nav className={s.pagination} aria-label="Pagination">
      {from !== null && (
        <span className={s.range}>
          {from.toLocaleString('fr-CH')}–{to.toLocaleString('fr-CH')} sur {total.toLocaleString('fr-CH')}
        </span>
      )}

      <div className={s.controls}>
        <button
          className={s.pageBtn}
          disabled={page === 1}
          onClick={() => go(1)}
          aria-label="Première page"
          title="Première page"
        >
          <ChevronsLeft size={15} />
        </button>
        <button
          className={s.pageBtn}
          disabled={page === 1}
          onClick={() => go(page - 1)}
          aria-label="Page précédente"
        >
          <ChevronLeft size={15} />
        </button>

        <div className={s.numbers}>
          {buildPages(page, totalPages).map(item =>
            item.gap ? (
              <span key={item.key} className={s.gap}>…</span>
            ) : (
              <button
                key={item.key}
                className={`${s.pageNum} ${item.page === page ? s.pageNumActive : ''}`}
                onClick={() => go(item.page)}
                aria-current={item.page === page ? 'page' : undefined}
              >
                {item.page}
              </button>
            )
          )}
        </div>

        <button
          className={s.pageBtn}
          disabled={page === totalPages}
          onClick={() => go(page + 1)}
          aria-label="Page suivante"
        >
          <ChevronRight size={15} />
        </button>
        <button
          className={s.pageBtn}
          disabled={page === totalPages}
          onClick={() => go(totalPages)}
          aria-label="Dernière page"
          title="Dernière page"
        >
          <ChevronsRight size={15} />
        </button>
      </div>

      {/* Saut direct — n'apparaît que lorsque parcourir page à page devient pénible */}
      {totalPages > 5 && (
        <label className={s.jump}>
          Aller à
          <input
            type="number"
            min="1"
            max={totalPages}
            className={s.jumpInput}
            placeholder={String(page)}
            onKeyDown={handleJump}
            aria-label={`Aller à une page entre 1 et ${totalPages}`}
          />
        </label>
      )}
    </nav>
  )
}
