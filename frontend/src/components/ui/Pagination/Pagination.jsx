import { ChevronLeft, ChevronRight } from 'lucide-react'
import s from './Pagination.module.css'

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  /* Génère la liste de pages à afficher — max 7 boutons avec ellipses */
  function getPages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4)   return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }

  return (
    <nav className={s.nav} aria-label="Pagination">
      <button
        className={s.arrow}
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Page précédente"
      >
        <ChevronLeft size={16} />
      </button>

      {getPages().map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className={s.ellipsis}>…</span>
        ) : (
          <button
            key={p}
            className={`${s.pageBtn} ${p === page ? s.active : ''}`}
            onClick={() => onChange(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        className={s.arrow}
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Page suivante"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}
