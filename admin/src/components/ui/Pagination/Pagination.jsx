import { ChevronLeft, ChevronRight } from 'lucide-react'
import s from './Pagination.module.css'

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null
  return (
    <div className={s.pagination}>
      <button className={s.pageBtn} disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={16} />
      </button>
      <span className={s.pageInfo}>Page {page} / {totalPages}</span>
      <button className={s.pageBtn} disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
