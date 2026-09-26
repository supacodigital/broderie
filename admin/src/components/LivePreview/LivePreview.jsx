import { useCallback, useEffect, useRef, useState } from 'react'
import { Monitor, Smartphone, RotateCw, X } from 'lucide-react'
import s from './LivePreview.module.css'

/* Aperçu en direct (Contenu du site) : la vraie boutique dans un cadre, qui
   affiche le brouillon de la page avant tout enregistrement.

   La boutique s'ouvre avec « ?apercu » (frontend utils/livePreview.js) et
   annonce { type: 'ready' } ; on lui envoie alors le brouillon à chaque
   modification, et le texte en cours d'édition pour qu'elle le montre.
   Production : boutique et administration partagent le domaine — c'est ce
   qui autorise le cadre (X-Frame-Options SAMEORIGIN). Développement : la
   boutique tourne sur son propre serveur (VITE_SHOP_URL). */

export const PREVIEW_SOURCE = 'apc-apercu'
export const SHOP_ORIGIN = import.meta.env.DEV
  ? new URL(import.meta.env.VITE_SHOP_URL || 'http://localhost:5173').origin
  : window.location.origin

// Largeurs de référence de la boutique (frontend utils/textStyle.js)
const DEVICES = {
  desktop: { width: 1280, label: 'Ordinateur', icon: Monitor },
  mobile:  { width: 375,  label: 'Natel',      icon: Smartphone },
}
const DEVICE_KEY = 'admin.previewDevice'
// Au-delà, la boutique ne répond pas : on le dit plutôt que de laisser tourner
const READY_TIMEOUT_MS = 15000

const readDevice = () => {
  try { return localStorage.getItem(DEVICE_KEY) === 'mobile' ? 'mobile' : 'desktop' } catch { return 'desktop' }
}

/**
 * @param path    page de la boutique ouverte au départ (« / », « /cgv »…)
 * @param page    contenu édité : home | about | legal | banner
 * @param draft   brouillon, forme de la réponse publique ; undefined tant que
 *                l'éditeur n'est pas chargé (rien n'est envoyé)
 * @param focus   texte en cours d'édition { key, path } ou null
 * @param onClose fermeture du panneau
 */
export default function LivePreview({ path, page, draft, focus, onClose }) {
  const frameRef = useRef(null)
  const viewportRef = useRef(null)
  // Nombre d'annonces « prête » : la boutique rechargée dans le cadre en refait une
  const [readyCount, setReadyCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [device, setDevice] = useState(readDevice)
  const [box, setBox] = useState({ width: 0, height: 0 })

  const post = useCallback((message) => {
    frameRef.current?.contentWindow?.postMessage({ source: PREVIEW_SOURCE, ...message }, SHOP_ORIGIN)
  }, [])

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== SHOP_ORIGIN) return
      if (event.data?.source !== PREVIEW_SOURCE || event.data.type !== 'ready') return
      setFailed(false)
      setReadyCount(n => n + 1)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Chargement (ou rechargement) : sans nouvelles de la boutique, on le signale
  useEffect(() => {
    setReadyCount(0)
    setFailed(false)
    const timer = setTimeout(() => setFailed(true), READY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [reloadKey])

  const ready = readyCount > 0

  useEffect(() => {
    if (ready && draft !== undefined) post({ type: 'draft', page, data: draft })
  }, [readyCount, ready, page, draft, post])

  useEffect(() => {
    if (ready) post({ type: 'focus', key: focus?.key ?? null, path: focus?.path ?? null })
  }, [readyCount, ready, focus, post])

  // Taille du panneau : la page est rendue à sa vraie largeur, puis réduite pour tenir
  useEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const chooseDevice = (next) => {
    setDevice(next)
    try { localStorage.setItem(DEVICE_KEY, next) } catch { /* préférence non retenue */ }
  }

  const deviceWidth = DEVICES[device].width
  const scale = box.width > 0 ? Math.min(1, box.width / deviceWidth) : 1
  const frameStyle = {
    width: deviceWidth,
    height: box.height > 0 ? box.height / scale : '100%',
    transform: `scale(${scale})`,
    left: box.width > 0 ? Math.max(0, (box.width - deviceWidth * scale) / 2) : 0,
  }

  return (
    <aside className={s.panel} aria-label="Aperçu en direct">
      <div className={s.toolbar}>
        <div className={s.heading}>
          <span className={s.title}>Aperçu en direct</span>
          <span className={s.subtitle}>Vos modifications, avant l’enregistrement</span>
        </div>
        <div className={s.actions}>
          <div className={s.devices} role="group" aria-label="Largeur de l’aperçu">
            {Object.entries(DEVICES).map(([key, { label, icon: Icon }]) => (
              <button
                key={key}
                type="button"
                className={s.device}
                aria-pressed={device === key}
                onClick={() => chooseDevice(key)}
              >
                <Icon size={14} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <button type="button" className={s.iconBtn} onClick={() => setReloadKey(k => k + 1)} aria-label="Recharger l’aperçu" title="Recharger l’aperçu">
            <RotateCw size={15} aria-hidden="true" />
          </button>
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Fermer l’aperçu" title="Fermer l’aperçu">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={viewportRef} className={s.viewport} data-device={device}>
        <iframe
          key={reloadKey}
          ref={frameRef}
          className={s.frame}
          style={frameStyle}
          src={`${SHOP_ORIGIN}${path}?apercu=1`}
          title="Aperçu de la boutique"
        />
        {!ready && (
          <div className={s.overlay} role="status">
            {failed ? (
              <>
                <p className={s.overlayText}>L’aperçu ne répond pas. La boutique est peut-être momentanément indisponible.</p>
                <button type="button" className={s.retryBtn} onClick={() => setReloadKey(k => k + 1)}>
                  <RotateCw size={14} aria-hidden="true" /> Réessayer
                </button>
              </>
            ) : (
              <p className={s.overlayText}>Chargement de la boutique…</p>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
