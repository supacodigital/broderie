import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { getAnnouncementBanner } from '../../../services/legal.service.js'
import { textStyle } from '../../../utils/textStyle.js'
import { previewTarget } from '../../../utils/livePreview.js'
import { usePreviewDraft } from '../../../hooks/usePreviewDraft.js'
import s from './AnnouncementBanner.module.css'

/* Clé de fermeture — le texte sert d'identifiant : un nouveau message réapparaît
   même si le précédent avait été fermé, sinon une annonce importante resterait
   invisible pour les clients ayant fermé la précédente. */
const DISMISS_KEY = 'announcement_dismissed'

export default function AnnouncementBanner() {
  const [banner,    setBanner]    = useState(null)
  const [dismissed, setDismissed] = useState(false)
  /* Aperçu en direct : le bandeau tel que réglé dans l'administration, même
     s'il avait été fermé sur ce navigateur (null = bandeau masqué). */
  const draft = usePreviewDraft('banner')
  const inPreview = draft !== undefined

  useEffect(() => {
    let cancelled = false
    getAnnouncementBanner()
      .then(data => {
        if (cancelled || !data?.text) return
        /* localStorage peut lever (navigation privée, cookies bloqués) : en cas
           d'échec on affiche le bandeau plutôt que de le masquer par erreur. */
        let previouslyDismissed = false
        try {
          previouslyDismissed = localStorage.getItem(DISMISS_KEY) === data.text
        } catch { /* stockage indisponible — on affiche */ }
        setBanner(data)
        setDismissed(previouslyDismissed)
      })
      .catch(() => { /* bandeau non critique : en cas d'échec, on n'affiche rien */ })
    return () => { cancelled = true }
  }, [])

  const current = inPreview ? draft : banner
  if (!current || (dismissed && !inPreview)) return null

  const close = () => {
    setDismissed(true)
    if (inPreview) return
    try { localStorage.setItem(DISMISS_KEY, current.text) } catch { /* sans effet */ }
  }

  /* Mise en forme réglée dans l'administration. Le lien porte son propre
     soulignement : « souligné » s'y applique aussi, pour pouvoir l'enlever. */
  const style = textStyle(current.style)
  const linkStyle = style?.textDecoration ? { textDecoration: style.textDecoration } : undefined

  const content = current.link
    ? <Link to={current.link} className={s.link} style={linkStyle}>{current.text}</Link>
    : <span>{current.text}</span>

  return (
    <div className={s.banner} role="status">
      <p className={s.text} style={style} {...previewTarget('banner_text')}>{content}</p>
      <button type="button" className={s.close} onClick={close} aria-label="Fermer l'annonce">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
