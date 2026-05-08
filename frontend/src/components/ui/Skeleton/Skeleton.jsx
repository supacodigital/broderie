import s from './Skeleton.module.css'

export function Skeleton({ className = '' }) {
  return <div className={`${s.skeleton} ${className}`} aria-hidden="true" />
}

/* heightRatio entre 0.7 et 1 — images légèrement variées pour éviter l'effet uniforme */
export function ProductCardSkeleton({ mode = 'grid', heightRatio = 1 }) {
  if (mode === 'list') {
    return (
      <div className={s.listCard} aria-hidden="true">
        <div className={s.listImage} />
        <div className={s.listBody}>
          <div>
            <div className={s.line} style={{ width: '30%', height: 10, marginBottom: 10 }} />
            <div className={s.line} style={{ width: '70%', height: 16, marginBottom: 8 }} />
            <div className={s.line} style={{ width: '90%', height: 11, marginBottom: 4 }} />
            <div className={s.line} style={{ width: '60%', height: 11 }} />
          </div>
          <div className={s.listActions}>
            <div className={s.line} style={{ width: 80, height: 18 }} />
            <div className={s.line} style={{ width: 110, height: 32, borderRadius: 4 }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={s.card} aria-hidden="true">
      <div className={s.image} style={{ aspectRatio: `3 / ${4 * heightRatio}` }} />
      <div className={s.line} style={{ width: '40%', height: 10, marginBottom: 8 }} />
      <div className={s.line} style={{ width: '85%', height: 14 }} />
      <div className={s.line} style={{ width: `${50 + Math.round(heightRatio * 20)}%`, height: 14, marginTop: 6 }} />
    </div>
  )
}
