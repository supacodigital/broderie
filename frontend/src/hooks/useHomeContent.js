import { useEffect, useState } from 'react'
import { getHomeContent } from '../services/legal.service.js'

/* Textes de la page d'accueil saisis dans l'administration (ADM-08).
   `text(clé, défaut)` renvoie le texte saisi, ou le texte d'origine tant que le
   champ est vide : la page d'accueil reste complète sans aucune saisie. */
export function useHomeContent() {
  const [content, setContent] = useState({})

  useEffect(() => {
    let cancelled = false
    getHomeContent()
      .then(data => { if (!cancelled) setContent(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const text = (key, fallback) => {
    const value = content[key]
    return typeof value === 'string' && value.trim() ? value : fallback
  }
  const isCustom = (key) => typeof content[key] === 'string' && content[key].trim() !== ''

  return { content, text, isCustom }
}
