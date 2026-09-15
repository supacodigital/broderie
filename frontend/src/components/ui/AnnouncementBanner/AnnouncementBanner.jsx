import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { getAnnouncementBanner } from '../../../services/legal.service.js'
import s from './AnnouncementBanner.module.css'

/* Clé de fermeture — le texte sert d'identifiant : un nouveau message réapparaît
   même si le précédent avait été fermé, sinon une annonce importante resterait
   invisible pour les clients ayant fermé la précédente. */
const DISMISS_KEY = 'announcement_dismissed'

export default function AnnouncementBanner() {
  const [banner,    setBanner]    = useState(null)
  const [dismissed, setDismissed] = useState(false)

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

  if (!banner || dismissed) return null

  const close = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, banner.text) } catch { /* sans effet */ }
  }

  const content = banner.link
    ? <Link to={banner.link} className={s.link}>{banner.text}</Link>
    : <span>{banner.text}</span>

  return (
    <div className={s.banner} role="status">
      <p className={s.text}>{content}</p>
      <button type="button" className={s.close} onClick={close} aria-label="Fermer l'annonce">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
