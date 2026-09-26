import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  announceReady, handlePreviewMessage, subscribeDrafts, getDrafts,
} from '../../../utils/livePreview.js'
import './LivePreviewBridge.module.css'

const ACTIVE_ATTR = 'data-apercu-actif'
// Page chargée à la demande : le texte peut n'apparaître qu'un instant après
const MAX_ATTEMPTS = 20
const RETRY_MS = 100

/* Aperçu en direct, côté boutique (mode aperçu uniquement, voir
   utils/livePreview.js) : reçoit les messages de l'administration, ouvre la
   page du texte en cours d'édition, la fait défiler jusqu'à lui et l'encadre.
   Les brouillons eux-mêmes sont lus par chaque page (usePreviewDraft). */
export default function LivePreviewBridge() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const drafts = useSyncExternalStore(subscribeDrafts, getDrafts, getDrafts)
  // n : numéro de la demande — deux demandes pour le même texte restent distinctes
  const [focus, setFocus] = useState({ key: null, path: null, n: 0 })
  const pathnameRef = useRef(pathname)
  const scrolledFor = useRef(0)

  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => {
    const onMessage = (event) => {
      const request = handlePreviewMessage(event)
      if (request) setFocus(prev => ({ ...request, n: prev.n + 1 }))
    }
    window.addEventListener('message', onMessage)
    announceReady()
    return () => window.removeEventListener('message', onMessage)
  }, [])

  /* Texte d'une autre page (ex. mentions légales pendant que les CGV sont
     affichées) : on ouvre sa page. Seulement à la demande — on reste libre de
     naviguer dans l'aperçu pendant l'édition. */
  useEffect(() => {
    if (focus.key && focus.path && focus.path !== pathnameRef.current) navigate(focus.path)
  }, [focus, navigate])

  /* Encadre le texte en cours d'édition. Reposé à chaque brouillon : un texte
     découpé en paragraphes en crée de nouveaux au fil de la saisie. Défilement
     une seule fois par demande, pas à chaque frappe. */
  useEffect(() => {
    if (!focus.key) return undefined
    const selector = `[data-apercu="${focus.key}"]`
    let marked = []
    let attempts = 0
    let timer
    const apply = () => {
      const found = [...document.querySelectorAll(selector)]
      if (found.length === 0) {
        attempts += 1
        if (attempts < MAX_ATTEMPTS) timer = setTimeout(apply, RETRY_MS)
        return
      }
      found.forEach(el => el.setAttribute(ACTIVE_ATTR, ''))
      marked = found
      if (scrolledFor.current !== focus.n) {
        scrolledFor.current = focus.n
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        found[0].scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
      }
    }
    apply()
    return () => {
      clearTimeout(timer)
      marked.forEach(el => el.removeAttribute(ACTIVE_ATTR))
    }
  }, [focus, pathname, drafts])

  return null
}
