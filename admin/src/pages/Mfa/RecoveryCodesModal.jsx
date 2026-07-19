import { useState } from 'react'
import { Copy, Check, Download, ShieldCheck } from 'lucide-react'
import s from './RecoveryCodesModal.module.css'

/* Modale bloquante — affiche les codes de récupération UNE SEULE FOIS (setup initial
   ou régénération). Ne se ferme pas au clic extérieur : la checkbox "j'ai sauvegardé
   mes codes" est obligatoire pour continuer, car ces codes ne seront plus jamais
   récupérables via l'API après cette étape. */
export default function RecoveryCodesModal({ codes, onContinue }) {
  const [confirmed, setConfirmed] = useState(false)
  const [copied,    setCopied]    = useState(false)

  const codesText = codes.join('\n')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codesText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([codesText], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'codes-recuperation-mfa.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="recovery-codes-title">
      <div className={s.modal}>
        <div className={s.iconWrap}>
          <ShieldCheck size={22} />
        </div>
        <h2 id="recovery-codes-title" className={s.title}>Vos codes de récupération</h2>
        <p className={s.desc}>
          Conservez ces 10 codes en lieu sûr. Chacun ne peut être utilisé qu'une seule fois
          pour vous connecter si vous perdez l'accès à votre application d'authentification.
          Ils ne seront plus jamais affichés.
        </p>

        <div className={s.codesGrid}>
          {codes.map((code) => (
            <span key={code} className={s.code}>{code}</span>
          ))}
        </div>

        <div className={s.actions}>
          <button type="button" className={s.actionBtn} onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
          <button type="button" className={s.actionBtn} onClick={handleDownload}>
            <Download size={14} />
            Télécharger
          </button>
        </div>

        <label className={s.confirmRow}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          J'ai sauvegardé mes codes en lieu sûr
        </label>

        <button
          type="button"
          className={s.continueBtn}
          disabled={!confirmed}
          onClick={onContinue}
        >
          Continuer
        </button>
      </div>
    </div>
  )
}
