import { useCallback, useEffect, useState } from 'react'
import { Save, AlertCircle } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SettingsSection, { SaveFeedback } from '../../components/ui/SettingsSection/SettingsSection.jsx'
import { useDirtyTracker } from '../../hooks/useDirtyTracker.js'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx'
import { getEmailContent, updateEmailContent } from '../../services/content.service.js'
import s from './Content.module.css'

/* Textes des e-mails d'inscription (CLI-11) — « besoin d'avoir la main pour
   modifier ce texte ». Un champ laissé vide garde le texte actuellement envoyé,
   affiché sous le champ pour savoir ce que l'on remplace. Pas de mise en
   forme : Gmail, Outlook et la plupart des messageries ignorent les polices
   web, le réglage serait trompeur. */
const EMAIL_FIELDS = [
  { key: 'email_welcome_text', label: 'E-mail de bienvenue',
    desc: 'Envoyé dès la création d’un compte, sous le titre « Bienvenue, [prénom] ! » et au-dessus du bouton « Découvrir la boutique ».' },
  { key: 'email_verify_text', label: 'E-mail de confirmation de l’adresse',
    desc: 'Envoyé à l’inscription, sous le titre « Confirmez votre adresse email » et au-dessus du bouton de confirmation. Le lien de confirmation et la mention newsletter restent inchangés.' },
]

export default function EmailsEditor() {
  const { setDirty } = useUnsavedChanges()
  const [values,   setValues]   = useState({})
  const [defaults, setDefaults] = useState({})
  const [ready,    setReady]    = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [status,   setStatus]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const { resetBaseline } = useDirtyTracker(values, !ready, setDirty)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await getEmailContent()
      setValues(prev => ({ ...prev, ...res.values }))
      setDefaults(res.defaults ?? {})
      setReady(true)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateEmailContent(values)
      setStatus('saved')
      resetBaseline()
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  if (loadError) return <ErrorBanner onRetry={load} />

  return (
    <>
      <div className={s.note}>
        <AlertCircle size={13} aria-hidden="true" />
        <span>Un champ laissé vide garde le texte actuellement envoyé. Laissez une ligne vide entre deux paragraphes pour les séparer.</span>
      </div>

      <div className={s.sections}>
        {EMAIL_FIELDS.map(({ key, label, desc }) => (
          <SettingsSection key={key} title={label} desc={desc}>
            {!ready ? (
              <div className={s.skeleton} style={{ height: 120 }} />
            ) : (
              <div className={s.field}>
                <label className={s.label} htmlFor={key}>Texte de l’e-mail</label>
                <textarea
                  id={key}
                  className={s.textarea}
                  rows={6}
                  value={values[key] ?? ''}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder="Laisser vide pour garder le texte actuel"
                  aria-describedby={defaults[key] ? `${key}-current` : undefined}
                />
                {defaults[key] && (
                  <div id={`${key}-current`} className={s.currentText}>
                    <span className={s.currentTextLabel}>Texte actuellement envoyé si le champ est vide</span>
                    {defaults[key]}
                  </div>
                )}
              </div>
            )}
          </SettingsSection>
        ))}
      </div>

      <div className={s.saveBar}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || !ready}>
          <Save size={14} aria-hidden="true" />
          {saving ? 'Enregistrement…' : 'Enregistrer les textes'}
        </button>
      </div>
    </>
  )
}
