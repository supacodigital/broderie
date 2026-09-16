/* Découpe un libellé pour mettre en évidence les mots cherchés.
   La comparaison ignore la casse et les accents : saisir « mouline » doit surligner
   « mouliné », sinon le surlignage disparaît précisément sur les recherches que le
   moteur vient de rattraper (accents, pluriels, repli anti-faute).
   Le texte affiché reste toujours le libellé d'origine — seules les bornes des
   correspondances sont calculées sur la version normalisée, si bien qu'aucun
   caractère n'est perdu ni remplacé. */
const deaccent = (str) =>
  str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function highlightMatches(label, query) {
  const text = String(label ?? '')
  const terms = String(query ?? '')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(deaccent)

  if (terms.length === 0) return [{ text, match: false }]

  /* `deaccent` conserve la longueur de la chaîne (NFD retire des marques combinantes,
     jamais des caractères de base), donc les index calculés ici restent valables sur
     le texte d'origine. */
  const haystack = deaccent(text)
  const flags = new Array(text.length).fill(false)

  for (const term of terms) {
    let from = 0
    while (from <= haystack.length - term.length) {
      const at = haystack.indexOf(term, from)
      if (at === -1) break
      for (let i = at; i < at + term.length; i += 1) flags[i] = true
      from = at + term.length
    }
  }

  // Regroupe les caractères consécutifs de même état en segments affichables
  const segments = []
  let current = null
  for (let i = 0; i < text.length; i += 1) {
    if (!current || current.match !== flags[i]) {
      current = { text: text[i], match: flags[i] }
      segments.push(current)
    } else {
      current.text += text[i]
    }
  }
  return segments
}
