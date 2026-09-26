import { Check, AlertCircle } from 'lucide-react'
import s from './SettingsSection.module.css'

/* Carte de formulaire — titre, description, contenu. Partagée par les
   Paramètres de la boutique et le Contenu du site. */
export default function SettingsSection({ title, desc, children }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        {desc && <p className={s.sectionDesc}>{desc}</p>}
      </div>
      <div className={s.sectionBody}>{children}</div>
    </section>
  )
}

/* Retour d'enregistrement, à côté du bouton : « Enregistré » ou erreur */
export function SaveFeedback({ status }) {
  if (!status) return null
  return (
    <span className={`${s.saveFeedback} ${status === 'error' ? s.saveFeedbackError : ''}`} role="status">
      {status === 'saved'
        ? <><Check size={14} /> Enregistré</>
        : <><AlertCircle size={14} /> Erreur — réessayez</>
      }
    </span>
  )
}
