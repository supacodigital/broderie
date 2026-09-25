import { useEffect, useRef, useState } from 'react'
import { getLocalities } from '../services/localities.service.js'
import { SWISS_ZIP_REGEX } from '../utils/postalAddress.js'

const IDLE = { status: 'idle', localities: [] }
const LOADING = { status: 'loading', localities: [] }

/* Localités du NPA saisi (liste officielle de La Poste / swisstopo).
   status : idle (NPA incomplet) | loading | found | unknown (hors Suisse) | error */
export function useZipLocalities(zip) {
  const value = String(zip ?? '').trim()
  const complete = SWISS_ZIP_REGEX.test(value)
  const [result, setResult] = useState({ zip: '', ...IDLE })

  useEffect(() => {
    if (!complete) return
    let active = true
    getLocalities(value)
      .then(list => { if (active) setResult({ zip: value, status: list ? 'found' : 'unknown', localities: list ?? [] }) })
      .catch(() => { if (active) setResult({ zip: value, ...IDLE, status: 'error' }) })
    return () => { active = false }
  }, [value, complete])

  if (!complete) return IDLE
  return result.zip === value ? result : LOADING
}

/* Préremplit la localité et le canton d'un formulaire React Hook Form à partir du NPA :
   - une seule localité : remplie si le champ est vide, ou s'il avait lui-même été
     rempli automatiquement (on ne remplace jamais une saisie de la cliente) ;
   - canton : rempli dès que toutes les localités du NPA sont dans le même canton.
   Plusieurs localités : `choose` les propose au choix (ex. 1510 Moudon / Syens). */
export function useZipAutofill({ watch, getValues, setValue, fields }) {
  const lookup = useZipLocalities(watch(fields.zip))
  const autoCity = useRef(null)
  const { status, localities } = lookup

  useEffect(() => {
    if (status !== 'found') return
    const options = { shouldDirty: true, shouldValidate: true }
    const cantons = [...new Set(localities.map(l => l.canton))]
    if (cantons.length === 1 && fields.canton && getValues(fields.canton) !== cantons[0]) {
      setValue(fields.canton, cantons[0], options)
    }
    const current = String(getValues(fields.city) ?? '').trim()
    const autoFilled = Boolean(current) && current === autoCity.current
    if (localities.length === 1) {
      if ((!current || autoFilled) && current !== localities[0].city) {
        autoCity.current = localities[0].city
        setValue(fields.city, localities[0].city, options)
      }
    } else if (autoFilled && !localities.some(l => l.city === current)) {
      // Localité remplie pour l'ancien NPA : elle ne vaut plus, la cliente choisit
      autoCity.current = null
      setValue(fields.city, '', { shouldDirty: true })
    }
  }, [status, localities, fields.canton, fields.city, getValues, setValue])

  // Choix d'une localité parmi celles du NPA : localité ET canton correspondants
  const choose = (locality) => {
    const options = { shouldDirty: true, shouldValidate: true }
    autoCity.current = locality.city
    setValue(fields.city, locality.city, options)
    if (fields.canton) setValue(fields.canton, locality.canton, options)
  }

  return { ...lookup, choose }
}
