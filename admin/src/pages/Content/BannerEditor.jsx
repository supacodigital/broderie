import { useCallback, useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SettingsSection, { SaveFeedback } from '../../components/ui/SettingsSection/SettingsSection.jsx'
import TextStyleEditor from '../../components/TextStyleEditor/TextStyleEditor.jsx'
import { useDirtyTracker } from '../../hooks/useDirtyTracker.js'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx'
import { getBannerContent, updateBannerContent, getFontCatalog } from '../../services/content.service.js'
import { effectiveStyle, previewCss } from '../../utils/textStyle.js'
import { BANNER_FIELD } from './contentSections.js'
import { bannerDraft } from './previewDraft.js'
import s from './Content.module.css'

/* Bandeau d'annonce — message affiché tout en haut de la boutique :
   promotion, fermeture, délai de livraison exceptionnel.
   onDraft / onFocusText : aperçu en direct (voir FieldsEditor). */
export default function BannerEditor({ onDraft, onFocusText }) {
  const { setDirty } = useUnsavedChanges()
  const [values, setValues] = useState({ banner_enabled: '0', banner_text: '', banner_link: '' })
  const [style, setStyle] = useState(undefined)
  const [fonts, setFonts] = useState([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const form = useMemo(() => ({ values, style: style ?? null }), [values, style])
  const { resetBaseline } = useDirtyTracker(form, !ready, setDirty)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [content, catalog] = await Promise.all([getBannerContent(), getFontCatalog()])
      const { styles = {}, ...texts } = content
      setValues(prev => ({ ...prev, ...texts }))
      setStyle(styles.banner_text)
      setFonts(catalog)
      setReady(true)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Aperçu en direct : le bandeau tel qu'il s'afficherait, ou rien s'il est masqué
  useEffect(() => {
    if (ready) onDraft?.(bannerDraft(values, style, fonts))
  }, [ready, values, style, fonts, onDraft])

  /* Texte et lien : l'aperçu montre le bandeau. Il est sur toutes les pages :
     pas de page à ouvrir (path null). */
  const focusProps = {
    onFocus: () => onFocusText?.({ key: BANNER_FIELD.key, path: null }),
    onBlur: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onFocusText?.(null) },
  }

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))
  const isOn = values.banner_enabled === '1'

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    setErrorMsg('')
    try {
      const { styles = {}, ...texts } = await updateBannerContent({
        ...values,
        styles: style ? { banner_text: style } : {},
      })
      const saved = { ...values, ...texts }
      setValues(saved)
      setStyle(styles.banner_text)
      resetBaseline({ values: saved, style: styles.banner_text ?? null })
      setStatus('saved')
    } catch (err) {
      /* Le message du serveur est plus utile que « une erreur est survenue » :
         il précise par exemple qu'un lien doit commencer par « / ». */
      setErrorMsg(err.response?.data?.errors?.[0]?.message ?? '')
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }

  if (loadError) return <ErrorBanner onRetry={load} />

  const text = values.banner_text ?? ''
  const eff = effectiveStyle(style, BANNER_FIELD.look, fonts)

  return (
    <>
      <div className={s.sections}>
        <SettingsSection
          title="Bandeau d’annonce"
          desc="Message affiché tout en haut de la boutique. Utile pour une promotion, une fermeture ou un délai de livraison exceptionnel."
        >
          {!ready ? (
            <div className={s.skeleton} style={{ height: 120 }} />
          ) : (
            <div className={s.fields}>
              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={e => handleChange('banner_enabled', e.target.checked ? '1' : '0')}
                />
                <span>Afficher le bandeau sur la boutique</span>
              </label>

              <div className={s.field} {...focusProps}>
                <label className={s.label} htmlFor="banner_text">Texte de l’annonce</label>
                <input
                  id="banner_text"
                  className={s.input}
                  maxLength={200}
                  value={text}
                  onChange={e => handleChange('banner_text', e.target.value)}
                  placeholder="Ex : Boutique fermée du 24 au 31 décembre"
                />
                <span className={s.hint}>{text.length} / 200 caractères</span>
                <TextStyleEditor
                  value={style}
                  onChange={setStyle}
                  look={BANNER_FIELD.look}
                  bg={BANNER_FIELD.bg}
                  fonts={fonts}
                  sample={text || 'Boutique fermée du 24 au 31 décembre'}
                  showPreview={false}
                />
              </div>

              <div className={s.field} {...focusProps}>
                <label className={s.label} htmlFor="banner_link">Lien (facultatif)</label>
                <input
                  id="banner_link"
                  className={s.input}
                  value={values.banner_link ?? ''}
                  onChange={e => handleChange('banner_link', e.target.value)}
                  placeholder="/catalogue"
                />
                <span className={s.hint}>
                  Page du site vers laquelle le bandeau renvoie, commençant par « / ».
                  Laisser vide pour un message non cliquable.
                </span>
              </div>

              {/* Aperçu : le bandeau tel qu'il s'affichera, mise en forme comprise */}
              {text.trim() && (
                <div className={s.bannerPreview}>
                  <span className={s.previewLabel}>Aperçu{isOn ? '' : ' — bandeau masqué sur la boutique'}</span>
                  <div className={s.bannerPreviewBar}>
                    <p style={previewCss(eff)}>{text}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </SettingsSection>
      </div>

      <div className={s.saveBar}>
        {errorMsg && <span className={s.errText}>{errorMsg}</span>}
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || !ready}>
          <Save size={14} aria-hidden="true" />
          {saving ? 'Enregistrement…' : 'Enregistrer le bandeau'}
        </button>
      </div>
    </>
  )
}
