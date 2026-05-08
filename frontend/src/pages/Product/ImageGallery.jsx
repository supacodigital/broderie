import { useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import s from './ImageGallery.module.css'

const BG_FALLBACKS = [
  'linear-gradient(135deg,#fce7f3,#f9a8d4)',
  'linear-gradient(135deg,#fdf2f8,#fbcfe8)',
  'linear-gradient(135deg,#f5f3ff,#ddd6fe)',
  'linear-gradient(135deg,#fff7ed,#fed7aa)',
]

const BADGE_LABELS = {
  nouveaute:     'Nouveauté',
  coup_de_coeur: 'Coup de ♡',
  exclusif:      'Exclusif',
}

export default function ImageGallery({ images = [], productName = '', fallbackIcon = '🧵', badge = null, priceChf = null, comparePriceChf = null }) {
  const [active,  setActive]  = useState(0)
  const [zoomed,  setZoomed]  = useState(false)

  const hasImages = images.length > 0

  function prev() { setActive(i => (i - 1 + images.length) % images.length) }
  function next() { setActive(i => (i + 1)                % images.length) }

  function handleKeyDown(e) {
    if (e.key === 'ArrowLeft')  prev()
    if (e.key === 'ArrowRight') next()
    if (e.key === 'Escape')     setZoomed(false)
  }

  return (
    <div className={s.gallery}>
      {/* ── Image principale ── */}
      <div
        className={s.main}
        role="button"
        tabIndex={0}
        aria-label={hasImages ? `Agrandir ${productName}` : productName}
        onKeyDown={handleKeyDown}
        onClick={() => hasImages && setZoomed(true)}
      >
        {hasImages ? (
          <img
            key={active}
            src={images[active].url}
            alt={images[active].alt ?? productName}
            className={s.mainImg}
            width="600"
            height="800"
            srcSet={[
              images[active].url_medium && `${images[active].url_medium} 600w`,
              images[active].url_large  && `${images[active].url_large} 1200w`,
            ].filter(Boolean).join(', ') || undefined}
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        ) : (
          <div
            className={s.fallback}
            style={{ background: BG_FALLBACKS[0] }}
            aria-hidden="true"
          >
            <span className={s.fallbackIcon}>{fallbackIcon}</span>
          </div>
        )}

        {badge && (() => {
          const label = badge === 'promo' && priceChf && comparePriceChf
            ? `-${Math.round((1 - priceChf / comparePriceChf) * 100)}%`
            : BADGE_LABELS[badge] ?? badge
          return (
            <span className={`${s.badge} ${s[`badge_${badge}`] ?? ''}`}>
              {label}
            </span>
          )
        })()}

        {hasImages && (
          <div className={s.zoomHint} aria-hidden="true">
            <ZoomIn size={18} />
          </div>
        )}

        {/* Flèches navigation */}
        {images.length > 1 && (
          <>
            <button className={`${s.arrow} ${s.arrowLeft}`}  onClick={e => { e.stopPropagation(); prev() }} aria-label="Image précédente"><ChevronLeft size={20} /></button>
            <button className={`${s.arrow} ${s.arrowRight}`} onClick={e => { e.stopPropagation(); next() }} aria-label="Image suivante"><ChevronRight size={20} /></button>
          </>
        )}

        {/* Indicateur points mobile */}
        {images.length > 1 && (
          <div className={s.dots} aria-hidden="true">
            {images.map((_, i) => (
              <span key={i} className={`${s.dot} ${i === active ? s.dotActive : ''}`} />
            ))}
          </div>
        )}
      </div>

      {/* ── Miniatures ── */}
      {images.length > 1 && (
        <div className={s.thumbs} role="list" aria-label="Miniatures">
          {images.map((img, i) => (
            <button
              key={i}
              className={`${s.thumb} ${i === active ? s.thumbActive : ''}`}
              onClick={() => setActive(i)}
              aria-label={`Image ${i + 1}`}
              aria-pressed={i === active}
              role="listitem"
            >
              <img
                src={img.url}
                alt={img.alt ?? `${productName} ${i + 1}`}
                width="80"
                height="107"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Lightbox zoom ── */}
      {zoomed && hasImages && (
        <div
          className={s.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Image agrandie"
          onClick={() => setZoomed(false)}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          <button className={s.lightboxClose} onClick={() => setZoomed(false)} aria-label="Fermer">✕</button>
          <img
            src={images[active].url_large ?? images[active].url}
            alt={images[active].alt ?? productName}
            className={s.lightboxImg}
            onClick={e => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <button className={`${s.lightboxArrow} ${s.lightboxLeft}`}  onClick={e => { e.stopPropagation(); prev() }} aria-label="Image précédente"><ChevronLeft size={28} /></button>
              <button className={`${s.lightboxArrow} ${s.lightboxRight}`} onClick={e => { e.stopPropagation(); next() }} aria-label="Image suivante"><ChevronRight size={28} /></button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
