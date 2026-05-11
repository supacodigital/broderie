import s from './SkeletonTable.module.css'

export default function SkeletonTable({ rows = 8, cols = 5 }) {
  return (
    <div className={s.loadingRows}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={s.skeletonRow}>
          {Array.from({ length: cols }).map((__, j) => <span key={j} />)}
        </div>
      ))}
    </div>
  )
}
