import api from './api.js'

/* Localités d'un NPA suisse (répertoire officiel, Suisse uniquement), mises en
   cache par NPA : la validation du formulaire et le préremplissage posent la
   même question sans refaire l'appel.
   → [{ city, canton }] ; null si le NPA ne correspond à aucun domicile en Suisse.
   Erreur réseau : rejetée, et retirée du cache pour qu'un nouvel essai reparte. */
const localitiesCache = new Map()

export function getLocalities(zip) {
  const key = String(zip ?? '').trim()
  if (!localitiesCache.has(key)) {
    const request = api.get(`/shipping/localities/${key}`)
      .then(res => (res.data.data?.length ? res.data.data : null))
      .catch(err => {
        localitiesCache.delete(key)
        throw err
      })
    localitiesCache.set(key, request)
  }
  return localitiesCache.get(key)
}

/* NPA d'un domicile en Suisse — la boutique ne livre qu'en Suisse. Réseau
   indisponible : on laisse passer, le serveur refusera un NPA inconnu. */
export async function isSwissZip(zip) {
  try {
    return (await getLocalities(zip)) !== null
  } catch {
    return true
  }
}
