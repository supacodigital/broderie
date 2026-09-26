import { useCallback, useEffect, useMemo, useState } from 'react'
import { Save, AlertCircle } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SettingsSection, { SaveFeedback } from '../../components/ui/SettingsSection/SettingsSection.jsx'
import TextStyleEditor from '../../components/TextStyleEditor/TextStyleEditor.jsx'
import { useDirtyTracker } from '../../hooks/useDirtyTracker.js'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx'
import { getFontCatalog } from '../../services/content.service.js'
import { previewSample } from './contentSections.js'
import { pageDraft } from './previewDraft.js'
import s from './Content.module.css'

/* Erreur renvoyée par le serveur → texte concerné, pour l'afficher sous ce
   texte plutôt qu'en bas de page : « styles.hero_title.size » vise la mise en
   forme du titre, « hero_title » le texte lui-même. */
const errorFromResponse = (err) => {
  const first = err.response?.data?.errors?.[0]
  if (!first) return { key: null, message: err.response?.data?.message ?? '' }
  const [root, key] = first.field?.split('.') ?? []
  return root === 'styles'
    ? { key, onStyle: true, message: first.message }
    : { key: first.field, onStyle: false, message: first.message }
}

/**
 * Éditeur d'une page de contenu : un champ par texte, groupés par bloc dans
 * l'ordre de la page, chacun avec sa mise en forme. Textes et mise en forme
 * sont enregistrés ensemble.
 *
 * @param groups  blocs de la page (contentSections.js)
 * @param load    () => Promise<{ ...textes, styles }>
 * @param save    (données) => Promise<{ ...textes, styles }>
 * @param note    encart d'information en tête de page
 * @param saveLabel libellé du bouton d'enregistrement
 * @param onDraft     aperçu en direct : reçoit le brouillon à chaque modification
 * @param onFocusText aperçu en direct : texte en cours d'édition { key, path }, ou null
 * @param shopPath    page de la boutique où s'affichent les textes (sauf `path` propre au champ)
 */
export default function FieldsEditor({ groups, load, save, note, saveLabel, onDraft, onFocusText, shopPath }) {
  const { setDirty } = useUnsavedChanges()
  const [values, setValues] = useState({})
  const [styles, setStyles] = useState({})
  const [fonts, setFonts] = useState([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const form = useMemo(() => ({ values, styles }), [values, styles])
  // Référence prise seulement après un chargement réussi (un échec suivi de « Réessayer » n'est pas une modification)
  const { resetBaseline } = useDirtyTracker(form, !ready, setDirty)

  const loadAll = useCallback(async () => {
    setLoadError(false)
    try {
      const [content, catalog] = await Promise.all([load(), getFontCatalog()])
      const { styles: loadedStyles = {}, ...texts } = content
      setValues(texts)
      setStyles(loadedStyles)
      setFonts(catalog)
      setReady(true)
    } catch {
      setLoadError(true)
    }
  }, [load])

  useEffect(() => { loadAll() }, [loadAll])

  // Aperçu en direct : la page telle qu'elle s'afficherait, à chaque modification
  useEffect(() => {
    if (ready) onDraft?.(pageDraft(values, styles, fonts))
  }, [ready, values, styles, fonts, onDraft])

  /* Texte en cours d'édition : tant que le focus reste dans son bloc (champ
     ou mise en forme), l'aperçu le montre. */
  const focusProps = (field) => ({
    onFocus: () => onFocusText?.({ key: field.key, path: field.path ?? shopPath ?? null }),
    onBlur: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onFocusText?.(null) },
  })

  const setText = (key, text) => setValues(prev => ({ ...prev, [key]: text }))
  const setStyle = (key, style) => setStyles(prev => {
    const next = { ...prev }
    if (style) next[key] = style
    else delete next[key]
    return next
  })

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    setSaveError(null)
    try {
      const { styles: savedStyles = {}, ...texts } = await save({ ...values, styles })
      setValues(texts)
      setStyles(savedStyles)
      resetBaseline({ values: texts, styles: savedStyles })
      setStatus('saved')
    } catch (err) {
      setSaveError(errorFromResponse(err))
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  if (loadError) return <ErrorBanner onRetry={loadAll} />

  return (
    <>
      {note && (
        <div className={s.note}>
          <AlertCircle size={13} aria-hidden="true" />
          <span>{note}</span>
        </div>
      )}

      <div className={s.sections}>
        {groups.map(group => (
          <SettingsSection key={group.title} title={group.title} desc={group.desc}>
            {!ready ? (
              <div className={s.skeleton} style={{ height: 160 }} />
            ) : (
              <div className={s.fields}>
                {group.toggle && (
                  <label className={s.checkRow}>
                    <input
                      type="checkbox"
                      checked={values[group.toggle.key] !== '0'}
                      onChange={e => setText(group.toggle.key, e.target.checked ? '1' : '0')}
                    />
                    <span>{group.toggle.label}</span>
                  </label>
                )}
                {group.fields.map(field => {
                  const fieldError = saveError?.key === field.key ? saveError : null
                  return (
                    <div key={field.key} className={s.field} {...focusProps(field)}>
                      <label className={s.label} htmlFor={field.key}>{field.label}</label>
                      <textarea
                        id={field.key}
                        className={s.textarea}
                        rows={field.rows}
                        value={values[field.key] ?? ''}
                        onChange={e => setText(field.key, e.target.value)}
                        placeholder="Laisser vide pour garder le texte actuel"
                        aria-invalid={fieldError && !fieldError.onStyle ? 'true' : undefined}
                      />
                      {fieldError && !fieldError.onStyle && <span className={s.fieldError} role="alert">{fieldError.message}</span>}
                      {field.hint && <span className={s.hint}>{field.hint}</span>}
                      <TextStyleEditor
                        value={styles[field.key]}
                        onChange={style => setStyle(field.key, style)}
                        look={field.look}
                        bg={field.bg ?? group.bg}
                        kind={field.kind}
                        fonts={fonts}
                        sample={previewSample(values[field.key], field.sample)}
                        error={fieldError?.onStyle ? fieldError.message : null}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </SettingsSection>
        ))}
      </div>

      <div className={s.saveBar}>
        {saveError?.message && (
          <span className={s.errText}>
            {groups.some(g => g.fields.some(f => f.key === saveError.key))
              ? 'Rien n’a été enregistré : un texte est à corriger (signalé plus haut).'
              : saveError.message}
          </span>
        )}
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || !ready}>
          <Save size={14} aria-hidden="true" />
          {saving ? 'Enregistrement…' : saveLabel}
        </button>
      </div>
    </>
  )
}
