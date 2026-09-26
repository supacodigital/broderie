import { useEffect, useId, useRef, useState } from 'react'
import {
  Type, ChevronDown, RotateCcw, Italic, CaseUpper, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Check, TriangleAlert,
} from 'lucide-react'
import {
  WEIGHT_LABELS, CATEGORY_LABELS, ALIGN_LABELS, PALETTE, LIMITS,
  effectiveStyle, previewCss, mobileSize, nearestWeight, contrastRatio, minContrast, summarize,
} from '../../utils/textStyle.js'
import s from './TextStyleEditor.module.css'

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }

/* Retire une propriété (retour à l'apparence du site) ; renvoie undefined
   quand plus rien n'est réglé, pour ne rien stocker d'inutile. */
const withProp = (value, key, next) => {
  const style = { ...(value ?? {}) }
  if (next === undefined) delete style[key]
  else style[key] = next
  return Object.keys(style).length > 0 ? style : undefined
}

/* Champ numérique tolérant : la saisie reste libre pendant la frappe (« 1, »
   en route vers « 1,5 »), la virgule suisse est acceptée, et la valeur est
   ramenée dans les bornes en quittant le champ. */
function NumberField({ id, label, value, placeholder, limits, suffix, onCommit }) {
  const [text, setText] = useState(value === undefined ? '' : String(value).replace('.', ','))
  const focused = useRef(false)
  const decimals = String(limits.step).split('.')[1]?.length ?? 0

  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value).replace('.', ','))
  }, [value])

  const parse = (raw) => {
    const n = parseFloat(String(raw).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const normalize = (n) => Number(Math.min(limits.max, Math.max(limits.min, n)).toFixed(decimals))

  const onChange = (e) => {
    const raw = e.target.value
    setText(raw)
    if (raw.trim() === '') { onCommit(undefined); return }
    const n = parse(raw)
    if (n !== null && n >= limits.min && n <= limits.max) onCommit(Number(n.toFixed(decimals)))
  }

  const onBlur = () => {
    focused.current = false
    const n = parse(text)
    if (text.trim() === '' || n === null) { setText(''); onCommit(undefined); return }
    const next = normalize(n)
    setText(String(next).replace('.', ','))
    onCommit(next)
  }

  const range = `${String(limits.min).replace('.', ',')} à ${String(limits.max).replace('.', ',')}`
  return (
    <div className={s.control}>
      <label className={s.controlLabel} htmlFor={id}>{label}</label>
      <div className={s.numberWrap}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className={s.input}
          value={text}
          placeholder={placeholder}
          onFocus={() => { focused.current = true }}
          onChange={onChange}
          onBlur={onBlur}
          aria-describedby={`${id}-range`}
        />
        {suffix && <span className={s.suffix}>{suffix}</span>}
      </div>
      <span id={`${id}-range`} className={s.range}>De {range}</span>
    </div>
  )
}

/**
 * Réglages de mise en forme d'un texte du site, avec aperçu.
 *
 * @param value    réglages enregistrés pour ce texte (ou undefined)
 * @param onChange reçoit les nouveaux réglages (undefined = apparence du site)
 * @param look     apparence d'origine du texte sur la boutique
 * @param bg       fond du bloc sur la boutique (aperçu et contraste)
 * @param kind     'text' | 'button' — un bouton n'a ni alignement ni interligne
 * @param fonts    catalogue des polices (serveur)
 * @param sample   texte de l'aperçu
 * @param error    erreur renvoyée par le serveur pour ce texte
 * @param showPreview false quand la page affiche déjà son propre aperçu (bandeau)
 */
export default function TextStyleEditor({
  value, onChange, look, bg, kind = 'text', fonts, sample, error, showPreview = true,
}) {
  const uid = useId()
  const panelId = `${uid}-panel`
  const [open, setOpen] = useState(false)

  // Une erreur du serveur sur ce texte ouvre le panneau : elle doit se voir
  useEffect(() => { if (error) setOpen(true) }, [error])

  const eff = effectiveStyle(value, look, fonts)
  const weights = eff.font?.weights ?? [look.weight]
  const customized = Boolean(value)
  const isButton = kind === 'button'

  const set = (key, next) => onChange(withProp(value, key, next))

  /* Booléens : on ne stocke que l'écart à l'apparence du site — cocher puis
     décocher ne laisse aucune trace. */
  const toggle = (key) => {
    const next = !eff[key]
    set(key, next === look[key] ? undefined : next)
  }

  const changeFont = (key) => {
    let style = withProp(value, 'font', key || undefined)
    const font = fonts.find(f => f.key === key)
    // Graisse choisie absente de la nouvelle police : la plus proche disponible
    if (font && style?.weight && !font.weights.includes(style.weight)) {
      style = withProp(style, 'weight', nearestWeight(font.weights, style.weight))
    }
    onChange(style)
  }

  const fontsByCategory = Object.keys(CATEGORY_LABELS)
    .map(category => ({ category, list: fonts.filter(f => f.category === category) }))
    .filter(group => group.list.length > 0)
  const siteFontLabel = look.fontKey ? fonts.find(f => f.key === look.fontKey)?.label : null

  // Contraste : vérifié quand la couleur a été changée (les couleurs d'origine sont celles de la charte)
  const ratio = value?.color ? contrastRatio(eff.color, bg) : null
  const needed = minContrast(eff.size, eff.weight)
  const lowContrast = ratio !== null && ratio < needed

  const isCustomColor = value?.color && !PALETTE.some(p => p.value === value.color)

  return (
    <div className={s.editor}>
      <div className={s.bar}>
        <button
          type="button"
          className={`${s.toggle} ${open ? s.toggleOpen : ''}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
        >
          <Type size={14} aria-hidden="true" />
          Mise en forme
          <ChevronDown size={14} className={s.chevron} aria-hidden="true" />
        </button>
        {customized
          ? <span className={s.summary}><span className={s.badge}>Personnalisée</span>{summarize(value, fonts)}</span>
          : <span className={s.summaryMuted}>Apparence du site</span>}
      </div>

      {open && (
        <div id={panelId} className={s.panel}>
          <div className={s.controls}>
            {/* Police */}
            <div className={`${s.control} ${s.controlWide}`}>
              <label className={s.controlLabel} htmlFor={`${uid}-font`}>Police</label>
              <select
                id={`${uid}-font`}
                className={s.input}
                value={value?.font ?? ''}
                onChange={e => changeFont(e.target.value)}
              >
                <option value="">{siteFontLabel ? `Police du site (${siteFontLabel})` : 'Police du site'}</option>
                {fontsByCategory.map(({ category, list }) => (
                  <optgroup key={category} label={CATEGORY_LABELS[category]}>
                    {list.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Graisse */}
            <div className={s.control}>
              <label className={s.controlLabel} htmlFor={`${uid}-weight`}>Graisse</label>
              <select
                id={`${uid}-weight`}
                className={s.input}
                value={value?.weight ?? ''}
                onChange={e => set('weight', e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Du site ({WEIGHT_LABELS[look.weight] ?? look.weight})</option>
                {weights.map(w => <option key={w} value={w}>{WEIGHT_LABELS[w] ?? w} — {w}</option>)}
              </select>
            </div>

            <NumberField
              id={`${uid}-size`}
              label="Taille (grand écran)"
              value={value?.size}
              placeholder={String(look.size)}
              limits={LIMITS.size}
              suffix="px"
              onCommit={n => set('size', n)}
            />

            {!isButton && (
              <NumberField
                id={`${uid}-line`}
                label="Interligne"
                value={value?.lineHeight}
                placeholder={String(look.lineHeight).replace('.', ',')}
                limits={LIMITS.lineHeight}
                onCommit={n => set('lineHeight', n)}
              />
            )}

            <NumberField
              id={`${uid}-spacing`}
              label="Espacement des lettres"
              value={value?.letterSpacing}
              placeholder={String(look.letterSpacing).replace('.', ',')}
              limits={LIMITS.letterSpacing}
              suffix="em"
              onCommit={n => set('letterSpacing', n)}
            />
          </div>

          {/* Couleur */}
          <fieldset className={s.fieldset}>
            <legend className={s.controlLabel}>Couleur</legend>
            <div className={s.swatches}>
              <button
                type="button"
                className={`${s.swatchDefault} ${!value?.color ? s.selected : ''}`}
                aria-pressed={!value?.color}
                onClick={() => set('color', undefined)}
              >
                <span className={s.swatchDot} style={{ background: look.color }} aria-hidden="true" />
                Couleur du site
              </button>
              {PALETTE.map(p => (
                <button
                  key={p.value}
                  type="button"
                  className={`${s.swatch} ${value?.color === p.value ? s.selected : ''}`}
                  style={{ background: p.value }}
                  aria-pressed={value?.color === p.value}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => set('color', p.value)}
                >
                  {value?.color === p.value && (
                    <Check size={13} aria-hidden="true" className={contrastRatio(p.value, '#ffffff') < 3 ? s.checkDark : s.checkLight} />
                  )}
                </button>
              ))}
              <label className={`${s.swatchCustom} ${isCustomColor ? s.selected : ''}`}>
                <input
                  type="color"
                  className={s.colorInput}
                  value={value?.color ?? look.color}
                  onChange={e => set('color', e.target.value.toLowerCase())}
                />
                Autre couleur{isCustomColor ? ` (${value.color})` : ''}
              </label>
            </div>
          </fieldset>

          <div className={s.row}>
            {/* Alignement */}
            {!isButton && (
              <fieldset className={s.fieldset}>
                <legend className={s.controlLabel}>Alignement</legend>
                <div className={s.segmented}>
                  {Object.keys(ALIGN_LABELS).map(align => {
                    const Icon = ALIGN_ICONS[align]
                    const active = eff.align === align
                    return (
                      <button
                        key={align}
                        type="button"
                        className={`${s.segment} ${active ? s.segmentActive : ''}`}
                        aria-pressed={active}
                        aria-label={ALIGN_LABELS[align]}
                        title={ALIGN_LABELS[align]}
                        onClick={() => set('align', align === look.align ? undefined : align)}
                      >
                        <Icon size={15} aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {/* Italique, majuscules, souligné */}
            <fieldset className={s.fieldset}>
              <legend className={s.controlLabel}>Style</legend>
              <div className={s.segmented}>
                {[
                  ['italic', Italic, 'Italique'],
                  ['uppercase', CaseUpper, 'Majuscules'],
                  ['underline', Underline, 'Souligné'],
                ].map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`${s.segment} ${s.segmentText} ${eff[key] ? s.segmentActive : ''}`}
                    aria-pressed={eff[key]}
                    onClick={() => toggle(key)}
                  >
                    <Icon size={15} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {eff.italic && eff.font && !eff.font.italic && (
            <p className={s.note}>{eff.font.label} n’a pas d’italique dessinée : le navigateur penche simplement les lettres.</p>
          )}

          {showPreview && (
            <div className={s.previewBlock}>
              <span className={s.previewLabel}>Aperçu</span>
              <div className={s.preview} style={{ background: bg }}>
                <p className={isButton ? s.previewButtonWrap : s.previewText} style={isButton ? undefined : previewCss(eff)}>
                  {isButton
                    ? <span className={s.previewButton} style={previewCss(eff)}>{sample}</span>
                    : sample}
                </p>
              </div>
            </div>
          )}

          {value?.size > 18 && (
            <p className={s.note}>
              {value.size} px sur grand écran, réduit progressivement jusqu’à {mobileSize(value.size)} px sur Natel.
            </p>
          )}

          {lowContrast && (
            <p className={s.warning} role="status">
              <TriangleAlert size={14} aria-hidden="true" />
              Contraste insuffisant ({ratio.toFixed(1).replace('.', ',')}:1, minimum {String(needed).replace('.', ',')}:1) :
              ce texte sera difficile à lire, surtout sur Natel en plein jour.
            </p>
          )}

          {error && <p className={s.error} role="alert">{error}</p>}

          <div className={s.panelActions}>
            <button type="button" className={s.reset} onClick={() => onChange(undefined)} disabled={!customized}>
              <RotateCcw size={13} aria-hidden="true" />
              Revenir à l’apparence du site
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
