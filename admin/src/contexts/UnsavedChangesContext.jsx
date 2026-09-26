import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../components/ui/ConfirmDialog/ConfirmDialog.jsx'

/* Modifications non enregistrées — garde-fou commun à toute l'administration.

   Dans l'espace « Contenu du site », chaque page (accueil, bandeau, textes
   légaux…) est une entrée du menu : un clic dans le menu démontait la page et
   perdait sans un mot des textes et une mise en forme réglés patiemment.
   La page signale son état avec `setDirty` ; le menu (et la déconnexion)
   passent par `guard(action)`, qui demande confirmation s'il reste des
   modifications. La fermeture de l'onglet est couverte par « beforeunload ». */

const UnsavedChangesContext = createContext(null)

// Hors fournisseur (tests d'une page isolée) : aucune garde, navigation directe
const NO_GUARD = { dirty: false, setDirty: () => {}, guard: (action) => action() }

export function UnsavedChangesProvider({ children }) {
  const [dirty, setDirtyState] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const dirtyRef = useRef(false)

  const setDirty = useCallback((value) => {
    dirtyRef.current = Boolean(value)
    setDirtyState(Boolean(value))
  }, [])

  // Exécute l'action tout de suite, ou après confirmation s'il reste des modifications
  const guard = useCallback((action) => {
    if (!dirtyRef.current) { action(); return }
    setPendingAction(() => action)
  }, [])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const confirmLeave = () => {
    const action = pendingAction
    setDirty(false)
    action?.()
  }

  return (
    <UnsavedChangesContext.Provider value={{ dirty, setDirty, guard }}>
      {children}
      {pendingAction && (
        <ConfirmDialog
          message="Vos modifications ne sont pas enregistrées. Quitter cette page ?"
          onConfirm={confirmLeave}
          onClose={() => setPendingAction(null)}
        />
      )}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext) ?? NO_GUARD
}
