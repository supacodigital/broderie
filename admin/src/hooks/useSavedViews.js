import { useState, useCallback } from 'react'

/* Vues enregistrées — recherches récurrentes conservées sur le poste.
   Une vue n'est qu'une query string (« brand=DMC+Art.117&low_stock=true ») :
   la rejouer revient à naviguer vers cette URL, sans aucun format propre à
   inventer ni migration à prévoir si de nouveaux filtres apparaissent.

   Stockage navigateur assumé : c'est une préférence de confort, pas une donnée
   métier. Rien n'est envoyé au serveur, et une vue perdue (autre poste, cache
   vidé) ne coûte que de refaire le filtre. Les accès sont protégés : en
   navigation privée, localStorage peut lever à la lecture comme à l'écriture. */

const STORAGE_KEY = 'products:savedViews'
const MAX_VIEWS   = 12

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    // Défensif : un contenu corrompu ou d'une version antérieure ne doit pas casser la page
    return Array.isArray(parsed) ? parsed.filter(v => v && typeof v.name === 'string') : []
  } catch {
    return []
  }
}

const write = (views) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(views)) } catch { /* stockage indisponible */ }
}

export function useSavedViews() {
  const [views, setViews] = useState(read)

  /* Enregistre la vue courante. Un même nom écrase la vue existante plutôt que
     d'en créer une seconde : « Réassort DMC » doit rester une seule entrée. */
  const saveView = useCallback((name, query) => {
    const label = name.trim()
    if (!label) return
    setViews(prev => {
      const others = prev.filter(v => v.name.toLowerCase() !== label.toLowerCase())
      const next = [{ name: label, query }, ...others].slice(0, MAX_VIEWS)
      write(next)
      return next
    })
  }, [])

  const removeView = useCallback((name) => {
    setViews(prev => {
      const next = prev.filter(v => v.name !== name)
      write(next)
      return next
    })
  }, [])

  return { views, saveView, removeView, maxViews: MAX_VIEWS }
}
