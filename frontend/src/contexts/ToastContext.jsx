import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

/* Durée par défaut d'affichage d'un toast en ms */
const DEFAULT_DURATION = 4500

/* Fournisseur de toasts — gère une file FIFO de notifications éphémères */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  /* Ajoute un toast à la file et programme son retrait automatique */
  const showToast = useCallback((toast) => {
    counter.current += 1
    const id = counter.current
    const duration = toast.duration ?? DEFAULT_DURATION
    setToasts(prev => [...prev, { id, ...toast }])
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}
