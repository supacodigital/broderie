import { useEffect, useState } from 'react'
import { getHomeContent } from '../services/legal.service.js'
import { textStyle } from '../utils/textStyle.js'
import { usePreviewDraft } from './usePreviewDraft.js'

/* Textes de la page d'accueil saisis dans l'administration (ADM-08).
   `text(clé, défaut)` renvoie le texte saisi, ou le texte d'origine tant que le
   champ est vide : la page d'accueil reste complète sans aucune saisie.
   `style(clé)` renvoie la mise en forme réglée pour ce texte (police, taille…),
   ou undefined : le texte garde alors l'apparence prévue par le site.
   Aperçu en direct : le brouillon de l'administration remplace le contenu enregistré. */
export function useHomeContent() {
  const [saved, setSaved] = useState({})
  const content = usePreviewDraft('home') ?? saved

  useEffect(() => {
    let cancelled = false
    getHomeContent()
      .then(data => { if (!cancelled) setSaved(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const text = (key, fallback) => {
    const value = content[key]
    return typeof value === 'string' && value.trim() ? value : fallback
  }
  const isCustom = (key) => typeof content[key] === 'string' && content[key].trim() !== ''
  const style = (key) => textStyle(content.styles?.[key])

  return { content, text, isCustom, style }
}
