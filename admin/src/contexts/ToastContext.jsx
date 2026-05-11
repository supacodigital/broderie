import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import s from './ToastContext.module.css'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
}

function ToastItem({ toast, onRemove }) {
  const Icon = ICONS[toast.type] ?? Info

  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), toast.duration ?? 4000)
    return () => clearTimeout(t)
  }, [toast.id, toast.duration, onRemove])

  return (
    <div className={`${s.toast} ${s[toast.type]}`} role="alert">
      <Icon size={16} className={s.toastIcon} />
      <span className={s.toastMsg}>{toast.message}</span>
      <button className={s.toastClose} onClick={() => onRemove(toast.id)} aria-label="Fermer">
        <X size={13} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  /* Raccourcis */
  toast.success = (msg, dur) => toast(msg, 'success', dur)
  toast.error   = (msg, dur) => toast(msg, 'error',   dur ?? 6000)
  toast.warning = (msg, dur) => toast(msg, 'warning', dur)
  toast.info    = (msg, dur) => toast(msg, 'info',    dur)

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={s.container} aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}
