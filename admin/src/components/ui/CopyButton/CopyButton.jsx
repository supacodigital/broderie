import { useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useToast } from '../../../contexts/ToastContext.jsx'
import s from './CopyButton.module.css'

/* Bouton « copier » : l'icône confirme la copie une seconde et demie, sans
   ouvrir de toast pour un geste aussi fréquent. */
export default function CopyButton({ text, label }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copie impossible dans ce navigateur.')
    }
  }

  return (
    <button
      type="button"
      className={s.iconBtn}
      onClick={copy}
      aria-label={copied ? 'Copié' : label}
      title={copied ? 'Copié' : label}
      data-copied={copied}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  )
}
