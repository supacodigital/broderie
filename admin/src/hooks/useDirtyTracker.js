import { useEffect, useRef } from 'react'

/* Signale au parent qu'un formulaire porte des modifications non enregistrées.

   Les onglets des paramètres se démontent quand on en change : sans ce signal,
   une saisie en cours — les CGV notamment, de longs textes rédigés à la main —
   disparaissait sans le moindre avertissement.

   La comparaison se fait sur une sérialisation JSON de l'objet de valeurs, et
   non sur un drapeau posé à la première frappe : retaper la valeur d'origine ne
   doit pas laisser l'onglet marqué comme modifié.

   @param {object}   values     - valeurs courantes du formulaire
   @param {boolean}  loading    - true tant que le chargement initial n'est pas fini
   @param {Function} onDirtyChange - appelé avec true/false à chaque changement d'état
*/
export function useDirtyTracker(values, loading, onDirtyChange) {
  const baselineRef = useRef(null)

  /* La référence est prise à la fin du chargement, pas au montage : avant cela
     les champs sont vides et tout écart serait un faux positif. */
  useEffect(() => {
    if (loading) return
    if (baselineRef.current === null) baselineRef.current = JSON.stringify(values)
  }, [loading, values])

  useEffect(() => {
    if (loading || baselineRef.current === null) return
    onDirtyChange?.(JSON.stringify(values) !== baselineRef.current)
  }, [values, loading, onDirtyChange])

  /* À appeler après un enregistrement réussi : les valeurs courantes deviennent
     la nouvelle référence, l'onglet n'est plus « modifié ». */
  const resetBaseline = (saved) => {
    baselineRef.current = JSON.stringify(saved ?? values)
    onDirtyChange?.(false)
  }

  /* Libère le parent au démontage, sinon un onglet quitté après enregistrement
     resterait marqué comme modifié. */
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  return { resetBaseline }
}
