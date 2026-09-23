/* Historique des recherches de la cliente — sur l'appareil uniquement.

   Conservé dans le navigateur (localStorage), jamais envoyé au serveur : aucune
   donnée personnelle n'est traitée côté boutique (LPD), rien n'entre dans l'export
   des données ni dans la suppression de compte. La contrepartie : l'historique ne
   suit pas la cliente de son natel à son ordinateur.

   Stockage facultatif : navigation privée, stockage plein ou bloqué — l'historique
   est alors simplement vide, et la recherche fonctionne comme avant. */

const STORAGE_KEY = 'search_history'
// Au-delà, la liste déborde du tiroir mobile sans aider davantage
export const SEARCH_HISTORY_MAX = 5
// Un terme d'un caractère n'est pas une recherche (la boutique en exige deux)
const MIN_LENGTH = 2
// Même limite que le journal serveur des recherches sans résultat
const MAX_LENGTH = 100

// Comparaison sans casse ni espaces superflus : « Coton  Mouliné » = « coton mouliné »
const sameTerm = (a, b) =>
  a.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr') ===
  b.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')

export function readSearchHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((t) => typeof t === 'string' && t.trim()).slice(0, SEARCH_HISTORY_MAX)
      : []
  } catch {
    return []
  }
}

function writeSearchHistory(terms) {
  try {
    if (terms.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(terms))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* stockage indisponible : l'historique reste vide */ }
}

/* Ajoute une recherche LANCÉE (validée ou choisie), jamais une frappe en cours.
   Une recherche déjà présente remonte en tête au lieu d'être dupliquée. */
export function addToSearchHistory(term) {
  const clean = String(term ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH)
  if (clean.length < MIN_LENGTH) return
  const rest = readSearchHistory().filter((t) => !sameTerm(t, clean))
  writeSearchHistory([clean, ...rest].slice(0, SEARCH_HISTORY_MAX))
}

export function removeFromSearchHistory(term) {
  writeSearchHistory(readSearchHistory().filter((t) => !sameTerm(t, term)))
}

export function clearSearchHistory() {
  writeSearchHistory([])
}
