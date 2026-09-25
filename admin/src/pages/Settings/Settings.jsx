import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Save, Check, AlertCircle, Store, Truck, Receipt, FileText, ShieldCheck, RefreshCw, KeyRound, Megaphone, MapPin, Wallet, BookOpen, House, Plus, Trash2, Mail } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useDirtyTracker } from '../../hooks/useDirtyTracker.js'
import RecoveryCodesModal from '../Mfa/RecoveryCodesModal.jsx'
import { mfaGetStatus, mfaRegenerateRecoveryCodes, updatePassword } from '../../services/auth.service.js'
import {
  getStoreSettings,
  updateStoreSettings,
  getTaxRates,
  updateTaxRates,
  getShippingRates,
  updateShippingRates,
  getLegalSettings,
  updateLegalSettings,
  getPickupSettings,
  updatePickupSettings,
  getInvoiceSettings,
  updateInvoiceSettings,
  getBannerSettings,
  updateBannerSettings,
  getAboutSettings,
  updateAboutSettings,
  getHomeSettings,
  updateHomeSettings,
  getEmailSettings,
  updateEmailSettings,
} from '../../services/settings.service.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from './Settings.module.css'

/* ── Composant section générique ── */
function SettingsSection({ title, desc, children }) {
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

/* ── Feedback enregistrement ── */
function SaveFeedback({ status }) {
  if (!status) return null
  return (
    <span className={`${s.saveFeedback} ${status === 'error' ? s.saveFeedbackError : ''}`}>
      {status === 'saved'
        ? <><Check size={14} /> Enregistré</>
        : <><AlertCircle size={14} /> Erreur — réessayez</>
      }
    </span>
  )
}

/* ── Onglet Boutique ── */
function StoreTab({ onDirtyChange }) {
  const [values,  setValues]  = useState({ store_name: '', store_email: '', store_phone: '', store_address: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getStoreSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateStoreSettings(values)
      setStatus('saved')
      resetBaseline()  // l'onglet n'est plus « modifié »
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  const FIELDS = [
    { key: 'store_name',    label: 'Nom de la boutique',  type: 'text',  placeholder: 'Broderie & Cie' },
    { key: 'store_email',   label: 'E-mail de contact',   type: 'email', placeholder: 'contact@boutique.ch' },
    { key: 'store_phone',   label: 'Téléphone',           type: 'tel',   placeholder: '+41 xx xxx xx xx' },
    { key: 'store_address', label: 'Adresse postale',     type: 'text',  placeholder: 'Rue, ville, pays' },
  ]

  return (
    <SettingsSection
      title="Informations de la boutique"
      desc="Ces informations apparaissent sur les factures et emails transactionnels envoyés à vos clients."
    >
      {error && <ErrorBanner onRetry={load} />}
      {loading ? (
        <div className={s.skeletonRow}>
          {[1,2,3,4].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : (
        <>
          <div className={s.formRow}>
            {FIELDS.map(({ key, label, type, placeholder }) => (
              <div key={key} className={s.field}>
                <label className={s.label}>{label}</label>
                <input
                  type={type}
                  className={s.input}
                  placeholder={placeholder}
                  value={values[key] ?? ''}
                  onChange={e => handleChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className={s.formActions}>
            <SaveFeedback status={status} />
            <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </SettingsSection>
  )
}

/* ── Onglet TVA ── */
function TaxTab({ onDirtyChange }) {
  const [rates,   setRates]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(rates, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getTaxRates()
      setRates(res ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (id, value) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, rate: value } : r))
  }

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const payload = rates.map(r => ({ id: r.id, rate: parseFloat(r.rate) }))
      const res = await updateTaxRates(payload)
      setRates(res ?? rates)
      setStatus('saved')
      resetBaseline()  // l'onglet n'est plus « modifié »
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  const CATEGORY_LABEL = { standard: 'Taux normal',   reduced: 'Taux réduit',  hotel: 'Taux spécial hôtellerie' }
  const CATEGORY_HINT  = { standard: '8.1% — textile, électronique…', reduced: '2.6% — alimentation, livres…', hotel: '3.8% — hôtellerie' }

  return (
    <SettingsSection
      title="Taux de TVA (AFC)"
      desc="Taux en vigueur en Suisse. Toute modification doit être validée avec votre fiduciaire avant d'être appliquée."
    >
      {error && <ErrorBanner onRetry={load} />}
      {loading ? (
        <div className={s.skeletonRow}>
          {[1,2,3].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : (
        <>
          <div className={s.formRow}>
            {rates.map(r => (
              <div key={r.id} className={s.field}>
                <label className={s.label}>{CATEGORY_LABEL[r.category] ?? r.name}</label>
                <div className={s.inputWrap}>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    className={`${s.input} ${s.inputWithSuffix}`}
                    value={r.rate}
                    onChange={e => handleChange(r.id, e.target.value)}
                  />
                  <span className={s.inputSuffix}>%</span>
                </div>
                <span className={s.hint}>{CATEGORY_HINT[r.category] ?? ''}</span>
              </div>
            ))}
          </div>
          <div className={s.taxNote}>
            <AlertCircle size={13} />
            Les taux enregistrés ici ne s'appliquent qu'aux commandes à venir. Les commandes déjà passées conservent le taux en vigueur le jour de l'achat — leurs factures restent donc inchangées.</div>
          <div className={s.formActions}>
            <SaveFeedback status={status} />
            <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </SettingsSection>
  )
}

/* ── Onglet Livraison ── */
function ShippingTab({ onDirtyChange }) {
  const [rates,   setRates]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const { resetBaseline } = useDirtyTracker(rates, loading, onDirtyChange)

  /* Une ligne = une tranche « jusqu'à X kg » (ADM-10). Seul le plafond se saisit :
     chaque tranche commence là où finit la précédente, aucun poids ne peut
     tomber entre deux lignes. `key` identifie la ligne à l'écran. */
  const toRows = (list) => (list ?? []).map((r, i) => ({
    key:           `r${r.id ?? i}`,
    maxWeight:     String(parseFloat(r.max_weight)),
    priceChf:      String(r.price_chf),
    estimatedDays: r.estimated_days ?? '',
  }))

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      setRates(toRows(await getShippingRates()))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, field, value) => {
    setRates(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  const addTier = () => {
    const last = rates[rates.length - 1]
    const nextMax = last ? Math.max(parseFloat(last.maxWeight) || 0, 0) + 5 : 1
    setRates(prev => [...prev, { key: `n${Date.now()}`, maxWeight: String(nextMax), priceChf: '', estimatedDays: last?.estimatedDays ?? '' }])
  }

  const removeTier = (key) => setRates(prev => prev.filter(r => r.key !== key))

  // Bornes affichées dans l'ordre des poids, comme elles s'appliqueront
  const sorted = [...rates].sort((a, b) => (parseFloat(a.maxWeight) || 0) - (parseFloat(b.maxWeight) || 0))
  const lowerBound = (key) => {
    const i = sorted.findIndex(r => r.key === key)
    return i <= 0 ? 0 : parseFloat(sorted[i - 1].maxWeight) || 0
  }

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    setErrorMsg('')
    try {
      const payload = sorted.map(r => ({
        maxWeight:     parseFloat(r.maxWeight),
        priceChf:      parseFloat(r.priceChf),
        estimatedDays: r.estimatedDays,
      }))
      // Les lignes renvoyées par le serveur deviennent la référence « non modifiée »
      const savedRows = toRows(await updateShippingRates(payload))
      setRates(savedRows)
      setStatus('saved')
      resetBaseline(savedRows)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.response?.data?.errors?.[0]?.message ?? err.response?.data?.message ?? '')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  return (
    <>
    <SettingsSection
      title="Frais de port"
      desc="Livraison Suisse uniquement via La Poste CH. Les frais sont toujours facturés au client, selon le poids total de la commande."
    >
      {error && <ErrorBanner onRetry={load} />}
      {loading ? (
        <div className={s.skeletonList}>
          {[1,2,3].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : (
        <>
          <div className={s.shippingTable}>
            <div className={`${s.shippingHead} ${s.shippingGrid}`}>
              <span>Poids de la commande</span>
              <span>Tarif (CHF)</span>
              <span>Délai estimé</span>
              <span aria-hidden="true" />
            </div>
            {sorted.map(r => (
              <div key={r.key} className={`${s.shippingRow} ${s.shippingGrid}`}>
                <div className={s.weightCell}>
                  <span className={s.weightFrom}>de {lowerBound(r.key)} à</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    className={`${s.input} ${s.inputWeight}`}
                    aria-label="Poids maximum de la tranche (kg)"
                    value={r.maxWeight}
                    onChange={e => handleChange(r.key, 'maxWeight', e.target.value)}
                  />
                  <span className={s.weightFrom}>kg</span>
                </div>
                <div className={s.inputWrap}>
                  <span className={s.inputPrefix}>CHF</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    className={`${s.input} ${s.inputWithPrefix} ${s.inputSm}`}
                    aria-label="Tarif de la tranche"
                    value={r.priceChf}
                    onChange={e => handleChange(r.key, 'priceChf', e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  maxLength={20}
                  className={`${s.input} ${s.inputSm}`}
                  placeholder="ex: 1-2 jours"
                  aria-label="Délai estimé"
                  value={r.estimatedDays}
                  onChange={e => handleChange(r.key, 'estimatedDays', e.target.value)}
                />
                <button
                  type="button"
                  className={s.btnIconDanger}
                  onClick={() => removeTier(r.key)}
                  disabled={rates.length <= 1}
                  aria-label="Supprimer cette tranche"
                  title="Supprimer cette tranche"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className={s.hint}>
            Une commande plus lourde que la dernière tranche est facturée au tarif de cette dernière tranche.
          </p>
          <div className={s.formActions}>
            <button type="button" className={s.btnSecondary} onClick={addTier} disabled={rates.length >= 12}>
              <Plus size={14} /> Ajouter une tranche
            </button>
            <SaveFeedback status={status} />
            {errorMsg && <span className={s.errText}>{errorMsg}</span>}
            <button className={s.btnSave} onClick={handleSave} disabled={saving || loading || rates.length === 0}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </SettingsSection>

    {/* Guide d'expédition (ADM-10 — « documenter l'utilisation de WebStamp /
        PostLogistics »). Placé à côté de la grille : c'est ici que la cliente
        vient quand elle se pose la question. */}
    <SettingsSection
      title="Expédier une commande"
      desc="Deux façons d’affranchir un envoi : l’étiquette La Poste générée depuis l’administration, ou WebStamp sur post.ch."
    >
      <div className={s.guide}>
        <h3 className={s.guideTitle}>1. Étiquette La Poste depuis l’administration (PostLogistics)</h3>
        <ol className={s.guideList}>
          <li>Ouvrez la commande (Commandes → la commande), carte <strong>Expédition</strong>.</li>
          <li>Choisissez le <strong>mode d’envoi</strong> : <strong>PostPac Economy</strong> (livré en 2 jours ouvrables, le moins cher) ou <strong>PostPac Priority</strong> (livré le jour ouvrable suivant).</li>
          <li>Cliquez sur <strong>Générer</strong>, puis sur l’icône de téléchargement : imprimez l’étiquette (format A6) et collez-la sur le colis.</li>
          <li>Passez la commande en <strong>Expédiée</strong> : la cliente reçoit un e-mail avec son numéro de suivi.</li>
        </ol>
        <p className={s.guideNote}>
          Raccourci : si vous passez directement la commande en « Expédiée » sans étiquette, elle est générée à ce moment-là, dans le mode d’envoi choisi. L’envoi est facturé par La Poste sur votre compte client.
        </p>

        <h3 className={s.guideTitle}>2. WebStamp (post.ch)</h3>
        <ol className={s.guideList}>
          <li>Affranchissez l’envoi sur <a href="https://www.post.ch/fr/expedier-des-lettres/affranchir-des-lettres/webstamp" target="_blank" rel="noopener noreferrer">post.ch — WebStamp</a> (lettres, petits envois), imprimez l’affranchissement.</li>
          <li>Si l’envoi a un numéro de suivi (colis, lettre recommandée), saisissez-le dans <strong>Suivi manuel</strong> de la commande.</li>
          <li>Choisissez le mode d’envoi <strong>Déjà affranchi (WebStamp)</strong>, puis passez la commande en <strong>Expédiée</strong> : aucune étiquette n’est générée en plus, la cliente reçoit l’e-mail d’expédition.</li>
        </ol>

        <h3 className={s.guideTitle}>Poids des articles</h3>
        <p className={s.guideNote}>
          Les frais de port sont calculés sur le poids total des articles de la commande (champ <strong>Poids</strong> de chaque fiche produit). Un article sans poids compte pour 0 kg : sans poids renseigné, une commande lourde est facturée au tarif de la première tranche.
        </p>
      </div>
    </SettingsSection>
    </>
  )
}

/* ── Onglet Textes légaux ── */
function LegalTab({ onDirtyChange }) {
  const [values,  setValues]  = useState({ cgv: '', mentions_legales: '', politique_retour: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getLegalSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateLegalSettings(values)
      setStatus('saved')
      resetBaseline()  // l'onglet n'est plus « modifié »
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  const FIELDS = [
    {
      key:   'cgv',
      label: 'Conditions générales de vente (CGV)',
      desc:  'Obligatoires et acceptées avant validation commande (CO suisse art. 40a).',
    },
    {
      key:   'mentions_legales',
      label: 'Mentions légales',
      desc:  'Identité de l\'entreprise, numéro IDE, responsable éditorial.',
    },
    {
      key:   'politique_retour',
      label: 'Politique de retour',
      desc:  'Délai de rétractation et modalités de renvoi (14 jours recommandés en Suisse).',
    },
  ]

  return (
    <>
      {error && <ErrorBanner onRetry={load} />}

      <div className={s.legalNote}>
        <AlertCircle size={13} />
        Ces textes sont affichés sur la boutique et dans les emails de confirmation. Ils doivent être validés par un juriste avant mise en production.
      </div>

      <div className={s.sections}>
        {FIELDS.map(({ key, label, desc }) => (
          <SettingsSection key={key} title={label} desc={desc}>
            {loading ? (
              <div className={s.skeleton} style={{ height: 120 }} />
            ) : (
              <textarea
                className={s.textarea}
                rows={8}
                value={values[key] ?? ''}
                onChange={e => handleChange(key, e.target.value)}
                placeholder={`Saisir le texte ${label.toLowerCase()}…`}
              />
            )}
          </SettingsSection>
        ))}
      </div>

      <div className={s.formActions} style={{ marginTop: 8 }}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
          <Save size={14} />
          {saving ? 'Enregistrement…' : 'Enregistrer tous les textes'}
        </button>
      </div>
    </>
  )
}

/* ── Onglet Notre Histoire ──
   Contenu de la page « Qui sommes-nous » (ADM-08). Il vivait dans les fichiers de
   traduction, donc figé au build : la cliente ne pouvait pas corriger une phrase
   sans intervention de développement.
   Un champ par bloc plutôt qu'un grand texte : la mise en page de la page
   (citation mise en exergue, chronologie) survit ainsi à une simple correction. */
function AboutTab({ onDirtyChange }) {
  const [values,  setValues]  = useState({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getAboutSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateAboutSettings(values)
      setStatus('saved')
      resetBaseline()
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  /* `rows` distingue une ligne d'un paragraphe : un titre n'a pas besoin d'une
     zone de huit lignes, et un texte long ne tient pas sur deux. */
  const FIELDS = [
    { key: 'about_title',    label: 'Titre de la page', rows: 1,
      desc: 'Affiché en grand en haut de la page.' },
    { key: 'about_subtitle', label: 'Phrase d’accroche', rows: 2,
      desc: 'Juste sous le titre.' },
    { key: 'about_quote',    label: 'Citation mise en avant', rows: 3,
      desc: 'Encadrée et mise en valeur avant le texte principal.' },
    { key: 'about_who_title', label: 'Titre de la première partie', rows: 1 },
    { key: 'about_who',      label: 'Première partie', rows: 8,
      desc: 'Laissez une ligne vide entre deux paragraphes pour les séparer.' },
    { key: 'about_mission_title', label: 'Titre de la seconde partie', rows: 1 },
    { key: 'about_mission',  label: 'Seconde partie', rows: 6,
      desc: 'Laissez une ligne vide entre deux paragraphes pour les séparer.' },
    { key: 'about_signature', label: 'Signature', rows: 1,
      desc: 'Le prénom affiché en fin de texte.' },
    { key: 'about_year_1',      label: 'Première date', rows: 1 },
    { key: 'about_year_1_text', label: 'Texte de la première date', rows: 2 },
    { key: 'about_year_2',      label: 'Seconde date', rows: 1 },
    { key: 'about_year_2_text', label: 'Texte de la seconde date', rows: 2 },
  ]

  return (
    <>
      {error && <ErrorBanner onRetry={load} />}

      <div className={s.legalNote}>
        <AlertCircle size={13} />
        Un champ laissé vide garde le texte actuellement affiché sur la boutique. Vous pouvez donc ne modifier qu’un seul paragraphe.
      </div>

      <div className={s.sections}>
        {FIELDS.map(({ key, label, desc, rows }) => (
          <SettingsSection key={key} title={label} desc={desc}>
            {loading ? (
              <div className={s.skeleton} style={{ height: rows > 2 ? 120 : 44 }} />
            ) : (
              <textarea
                className={s.textarea}
                rows={rows}
                value={values[key] ?? ''}
                onChange={e => handleChange(key, e.target.value)}
                placeholder="Laisser vide pour garder le texte actuel"
              />
            )}
          </SettingsSection>
        ))}
      </div>

      <div className={s.formActions} style={{ marginTop: 8 }}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
          <Save size={14} />
          {saving ? 'Enregistrement…' : 'Enregistrer la page'}
        </button>
      </div>
    </>
  )
}

/* ── Onglet E-mails ── textes des e-mails d'inscription (CLI-11) ──
   « Besoin d'avoir la main pour modifier ce texte ». Même principe que les
   autres contenus : un champ laissé vide garde le texte actuellement envoyé,
   affiché sous le champ pour savoir ce que l'on remplace. */
const EMAIL_FIELDS = [
  { key: 'email_welcome_text', label: 'E-mail de bienvenue',
    desc: 'Envoyé dès la création d’un compte, sous le titre « Bienvenue, [prénom] ! » et au-dessus du bouton « Découvrir la boutique ».' },
  { key: 'email_verify_text', label: 'E-mail de confirmation de l’adresse',
    desc: 'Envoyé à l’inscription, sous le titre « Confirmez votre adresse email » et au-dessus du bouton de confirmation. Le lien de confirmation et la mention newsletter restent inchangés.' },
]

function EmailsTab({ onDirtyChange }) {
  const [values,   setValues]   = useState({})
  const [defaults, setDefaults] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [status,   setStatus]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getEmailSettings()
      setValues(prev => ({ ...prev, ...res.values }))
      setDefaults(res.defaults ?? {})
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateEmailSettings(values)
      setStatus('saved')
      resetBaseline()
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  return (
    <>
      {error && <ErrorBanner onRetry={load} />}

      <div className={s.legalNote}>
        <AlertCircle size={13} />
        Un champ laissé vide garde le texte actuellement envoyé. Laissez une ligne vide entre deux paragraphes pour les séparer.
      </div>

      <div className={s.sections}>
        {EMAIL_FIELDS.map(({ key, label, desc }) => (
          <SettingsSection key={key} title={label} desc={desc}>
            {loading ? (
              <div className={s.skeleton} style={{ height: 120 }} />
            ) : (
              <>
                <textarea
                  className={s.textarea}
                  rows={6}
                  value={values[key] ?? ''}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder="Laisser vide pour garder le texte actuel"
                  aria-describedby={`${key}-current`}
                />
                {defaults[key] && (
                  <div id={`${key}-current`} className={s.currentText}>
                    <span className={s.currentTextLabel}>Texte actuellement envoyé si le champ est vide</span>
                    {defaults[key]}
                  </div>
                )}
              </>
            )}
          </SettingsSection>
        ))}
      </div>

      <div className={s.formActions} style={{ marginTop: 8 }}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
          <Save size={14} />
          {saving ? 'Enregistrement…' : 'Enregistrer les textes'}
        </button>
      </div>
    </>
  )
}

/* ── Onglet Page d'accueil ── blocs promotionnels (ADM-08) ──
   Même principe que « Notre Histoire » : un champ par texte, et un champ laissé
   vide garde le texte actuellement affiché. Les champs sont groupés par bloc,
   dans l'ordre où ils apparaissent sur la page. */
const HOME_GROUPS = [
  {
    title: 'Bandeau principal',
    desc: 'Le grand bloc tout en haut de la page d’accueil.',
    fields: [
      { key: 'hero_eyebrow',       label: 'Petite ligne au-dessus du titre', rows: 1 },
      { key: 'hero_title',         label: 'Titre', rows: 2 },
      { key: 'hero_subtitle',      label: 'Sous-titre', rows: 2 },
      { key: 'hero_desc',          label: 'Texte', rows: 3 },
      { key: 'hero_cta',           label: 'Bouton principal (vers la boutique)', rows: 1 },
      { key: 'hero_cta_secondary', label: 'Second bouton (vers les nouveautés)', rows: 1 },
      { key: 'hero_stat1_value',   label: 'Premier chiffre', rows: 1 },
      { key: 'hero_stat1_label',   label: 'Légende du premier chiffre', rows: 1 },
      { key: 'hero_stat2_value',   label: 'Second chiffre', rows: 1 },
      { key: 'hero_stat2_label',   label: 'Légende du second chiffre', rows: 1 },
    ],
  },
  {
    title: 'Bloc « Notre histoire »',
    desc: 'Le bloc avec la photo de fils, sous les coups de cœur.',
    fields: [
      { key: 'crafts_eyebrow', label: 'Petite ligne au-dessus du titre', rows: 1 },
      { key: 'crafts_title',   label: 'Titre', rows: 1 },
      { key: 'crafts_text',    label: 'Texte', rows: 4 },
      { key: 'crafts_points',  label: 'Engagements', rows: 4, hint: 'Un engagement par ligne.' },
      { key: 'crafts_cta',     label: 'Bouton (vers la page Notre Histoire)', rows: 1 },
    ],
  },
  {
    title: 'Avantages',
    desc: 'Les trois arguments affichés côte à côte.',
    fields: [
      { key: 'advantage_1_title', label: 'Premier avantage — titre', rows: 1 },
      { key: 'advantage_1_desc',  label: 'Premier avantage — texte', rows: 2 },
      { key: 'advantage_2_title', label: 'Deuxième avantage — titre', rows: 1 },
      { key: 'advantage_2_desc',  label: 'Deuxième avantage — texte', rows: 2 },
      { key: 'advantage_3_title', label: 'Troisième avantage — titre', rows: 1 },
      { key: 'advantage_3_desc',  label: 'Troisième avantage — texte', rows: 2 },
    ],
  },
]

function HomeTab({ onDirtyChange }) {
  const [values,  setValues]  = useState({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getHomeSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateHomeSettings(values)
      setStatus('saved')
      resetBaseline()
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  // Chiffres clés affichés tant que la case n'a pas été décochée
  const statsShown = values.hero_stats_enabled !== '0'

  return (
    <>
      {error && <ErrorBanner onRetry={load} />}

      <div className={s.legalNote}>
        <AlertCircle size={13} />
        Un champ laissé vide garde le texte actuellement affiché sur la boutique. Vous pouvez donc ne modifier qu’un seul texte.
      </div>

      <div className={s.sections}>
        {HOME_GROUPS.map(group => (
          <SettingsSection key={group.title} title={group.title} desc={group.desc}>
            {loading ? (
              <div className={s.skeleton} style={{ height: 160 }} />
            ) : (
              <div className={s.contentFields}>
                {group.title === 'Bandeau principal' && (
                  <label className={s.checkRow}>
                    <input
                      type="checkbox"
                      checked={statsShown}
                      onChange={e => handleChange('hero_stats_enabled', e.target.checked ? '1' : '0')}
                    />
                    <span>Afficher les deux chiffres clés sous les boutons</span>
                  </label>
                )}
                {group.fields.map(({ key, label, rows, hint }) => (
                  <div key={key} className={s.field}>
                    <label className={s.label} htmlFor={key}>{label}</label>
                    <textarea
                      id={key}
                      className={s.textarea}
                      rows={rows}
                      value={values[key] ?? ''}
                      onChange={e => handleChange(key, e.target.value)}
                      placeholder="Laisser vide pour garder le texte actuel"
                    />
                    {hint && <span className={s.hint}>{hint}</span>}
                  </div>
                ))}
              </div>
            )}
          </SettingsSection>
        ))}
      </div>

      <div className={s.formActions} style={{ marginTop: 8 }}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
          <Save size={14} />
          {saving ? 'Enregistrement…' : 'Enregistrer la page d’accueil'}
        </button>
      </div>
    </>
  )
}

/* ── Onglet Bandeau d'annonce ──
   Message affiché en haut de la boutique : promotion, fermeture, délais de livraison.
   Modifiable par la cliente sans intervention technique. */
function BannerTab({ onDirtyChange }) {
  const [values,  setValues]  = useState({ banner_enabled: '0', banner_text: '', banner_link: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getBannerSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))
  const isOn = values.banner_enabled === '1'

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    setErrorMsg('')
    try {
      await updateBannerSettings(values)
      setStatus('saved')
      resetBaseline()  // l'onglet n'est plus « modifié »
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

  return (
    <>
      {error && <ErrorBanner onRetry={load} />}

      <div className={s.sections}>
        <SettingsSection
          title="Bandeau d'annonce"
          desc="Message affiché tout en haut de la boutique. Utile pour une promotion, une fermeture ou un délai de livraison exceptionnel."
        >
          {loading ? (
            <div className={s.skeleton} style={{ height: 120 }} />
          ) : (
            <>
              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={e => handleChange('banner_enabled', e.target.checked ? '1' : '0')}
                />
                <span>Afficher le bandeau sur la boutique</span>
              </label>

              <div className={s.field} style={{ marginTop: 14 }}>
                <label className={s.label} htmlFor="banner_text">Texte de l'annonce</label>
                <input
                  id="banner_text"
                  className={s.input}
                  maxLength={200}
                  value={values.banner_text ?? ''}
                  onChange={e => handleChange('banner_text', e.target.value)}
                  placeholder="Ex : Boutique fermée du 24 au 31 décembre"
                />
                <span className={s.hint}>
                  {(values.banner_text ?? '').length} / 200 caractères
                </span>
              </div>

              <div className={s.field} style={{ marginTop: 12 }}>
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

              {/* Aperçu : évite d'aller vérifier sur la boutique après chaque essai */}
              {isOn && (values.banner_text ?? '').trim() && (
                <div className={s.bannerPreview}>
                  <span className={s.bannerPreviewLabel}>Aperçu</span>
                  <div className={s.bannerPreviewBar}>{values.banner_text}</div>
                </div>
              )}
            </>
          )}
        </SettingsSection>
      </div>

      <div className={s.formActions} style={{ marginTop: 8 }}>
        {errorMsg && <span className={s.errText}>{errorMsg}</span>}
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
          <Save size={14} />
          {saving ? 'Enregistrement…' : 'Enregistrer le bandeau'}
        </button>
      </div>
    </>
  )
}

/* ── Onglet Retrait en boutique ──
   Ces valeurs partent dans l'email « votre commande est prête ». Elles vivaient
   dans la configuration serveur : corriger un horaire imposait un accès SSH. */
function PickupTab({ onDirtyChange }) {
  const FIELDS = [
    { key: 'pickup_name',    label: 'Nom du point de retrait', placeholder: 'Au Point-Compté' },
    { key: 'pickup_address', label: 'Adresse',                 placeholder: 'Chemin du Collège 6' },
    { key: 'pickup_zip',     label: 'NPA',                     placeholder: '1509' },
    { key: 'pickup_city',    label: 'Localité',                placeholder: 'Vucherens' },
  ]

  const [values,  setValues]  = useState({ pickup_name: '', pickup_address: '', pickup_zip: '', pickup_city: '', pickup_hours: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getPickupSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updatePickupSettings(values)
      setStatus('saved')
      resetBaseline()
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Retrait en boutique"
      desc="Adresse et horaires envoyés au client dans l'email « votre commande est prête »."
    >
      {error ? <ErrorBanner onRetry={load} /> : (
        <>
          <div className={s.formRow}>
            {FIELDS.map(f => (
              <div key={f.key} className={s.field}>
                <label className={s.label} htmlFor={f.key}>{f.label}</label>
                <input
                  id={f.key}
                  className={s.input}
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={e => handleChange(f.key, e.target.value)}
                  disabled={loading}
                />
              </div>
            ))}
            <div className={`${s.field} ${s.fieldFull}`}>
              <label className={s.label} htmlFor="pickup_hours">Horaires d'ouverture</label>
              <textarea
                id="pickup_hours"
                className={s.textarea}
                rows={3}
                value={values.pickup_hours ?? ''}
                placeholder="Mardi 9h–12h et 13h30–18h30 · Mercredi 13h–18h · 1er samedi du mois 9h–16h"
                onChange={e => handleChange('pickup_hours', e.target.value)}
                disabled={loading}
              />
              <p className={s.hint}>Texte repris tel quel dans l'email envoyé au client.</p>
            </div>
          </div>
          <div className={s.formActions}>
            <SaveFeedback status={status} />
            <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </SettingsSection>
  )
}

/* ── Onglet Facturation ──
   Coordonnées imprimées sur la facture QR et délai de paiement. Le QR-IBAN
   reste volontairement hors interface : une erreur de saisie enverrait de
   vrais paiements clients sur le mauvais compte. */
function InvoiceTab({ onDirtyChange }) {
  const [values,  setValues]  = useState({ invoice_name: '', invoice_owner: '', invoice_address: '', invoice_zip: '', invoice_city: '', invoice_vat_number: '', invoice_due_days: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const { resetBaseline } = useDirtyTracker(values, loading, onDirtyChange)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getInvoiceSettings()
      setValues(prev => ({ ...prev, ...res }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateInvoiceSettings(values)
      setStatus('saved')
      resetBaseline()
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Facturation"
      desc="Coordonnées imprimées sur les factures QR et délai de paiement accordé au client."
    >
      {error ? <ErrorBanner onRetry={load} /> : (
        <>
          <div className={s.formRow}>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_name">Nom de l'émetteur</label>
              <input id="invoice_name" className={s.input} value={values.invoice_name ?? ''}
                placeholder="Au Point-Compté" onChange={e => handleChange('invoice_name', e.target.value)} disabled={loading} />
              <p className={s.hint}>Doit correspondre au titulaire du compte bancaire.</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_owner">Titulaire</label>
              <input id="invoice_owner" className={s.input} value={values.invoice_owner ?? ''}
                placeholder="Julie Guerle" onChange={e => handleChange('invoice_owner', e.target.value)} disabled={loading} />
              <p className={s.hint}>Prénom et nom de l'exploitante (raison individuelle), imprimés sous le nom de la boutique.</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_address">Adresse</label>
              <input id="invoice_address" className={s.input} value={values.invoice_address ?? ''}
                placeholder="Chemin du Collège 6" onChange={e => handleChange('invoice_address', e.target.value)} disabled={loading} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_zip">NPA</label>
              <input id="invoice_zip" className={s.input} value={values.invoice_zip ?? ''}
                placeholder="1509" onChange={e => handleChange('invoice_zip', e.target.value)} disabled={loading} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_city">Localité</label>
              <input id="invoice_city" className={s.input} value={values.invoice_city ?? ''}
                placeholder="Vucherens" onChange={e => handleChange('invoice_city', e.target.value)} disabled={loading} />
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_vat_number">Numéro de TVA</label>
              <input id="invoice_vat_number" className={s.input} value={values.invoice_vat_number ?? ''}
                placeholder="CHE-123.456.789 TVA" onChange={e => handleChange('invoice_vat_number', e.target.value)} disabled={loading} />
              <p className={s.hint}>À laisser vide tant que la boutique n'est pas assujettie (dès CHF 100 000 de CA).</p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="invoice_due_days">Délai de paiement (jours)</label>
              <input id="invoice_due_days" type="number" min="1" max="365" className={s.input}
                value={values.invoice_due_days ?? ''} placeholder="30"
                onChange={e => handleChange('invoice_due_days', e.target.value)} disabled={loading} />
              <p className={s.hint}>Échéance calculée depuis la date d'émission.</p>
            </div>
          </div>

          <div className={s.noteBox}>
            <AlertCircle size={15} />
            <span>
              Le compte bancaire (QR-IBAN) reste configuré sur le serveur : une erreur
              de saisie enverrait de vrais paiements sur le mauvais compte.
            </span>
          </div>

          <div className={s.formActions}>
            <SaveFeedback status={status} />
            <button className={s.btnSave} onClick={handleSave} disabled={saving || loading}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </SettingsSection>
  )
}

/* ── Changement de mot de passe ── */
function PasswordSection() {
  const [values,  setValues]  = useState({ current: '', next: '', confirm: '' })
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState(null) // null | 'saved' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setErrorMsg('')
    setStatus(null)

    if (!values.current || !values.next) {
      setErrorMsg('Mot de passe actuel et nouveau mot de passe requis.')
      return
    }
    if (values.next !== values.confirm) {
      setErrorMsg('Les mots de passe ne correspondent pas.')
      return
    }
    if (values.next.length < 12 || !/[A-Z]/.test(values.next) || !/[^A-Za-z0-9]/.test(values.next)) {
      setErrorMsg('Le nouveau mot de passe doit contenir au moins 12 caractères, une majuscule et un symbole.')
      return
    }

    setSaving(true)
    try {
      await updatePassword(values.current, values.next)
      setValues({ current: '', next: '', confirm: '' })
      setStatus('saved')
    } catch (err) {
      setErrorMsg(err.response?.status === 401
        ? 'Mot de passe actuel incorrect.'
        : 'Une erreur est survenue. Veuillez réessayer.')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Mot de passe"
      desc="Modifiez le mot de passe de votre compte administrateur."
    >
      {errorMsg && (
        <div className={s.taxNote}>
          <AlertCircle size={13} />
          {errorMsg}
        </div>
      )}
      <div className={s.formRow}>
        <div className={s.field}>
          <label className={s.label}>Mot de passe actuel</label>
          <input
            type="password"
            autoComplete="current-password"
            className={s.input}
            value={values.current}
            onChange={e => handleChange('current', e.target.value)}
          />
        </div>
        <div className={s.field}>
          <label className={s.label}>Nouveau mot de passe</label>
          <input
            type="password"
            autoComplete="new-password"
            className={s.input}
            value={values.next}
            onChange={e => handleChange('next', e.target.value)}
          />
          <p className={s.hint}>Au moins 12 caractères, une majuscule et un symbole.</p>
        </div>
        <div className={s.field}>
          <label className={s.label}>Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            autoComplete="new-password"
            className={s.input}
            value={values.confirm}
            onChange={e => handleChange('confirm', e.target.value)}
          />
        </div>
      </div>
      <div className={s.formActions}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving}>
          <KeyRound size={14} />
          {saving ? 'Enregistrement…' : 'Modifier le mot de passe'}
        </button>
      </div>
    </SettingsSection>
  )
}

/* ── Onglet Sécurité (MFA) ── */
function SecurityTab() {
  const [status,        setStatus]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(false)
  const [regenerating,  setRegenerating]  = useState(false)
  const [regenError,    setRegenError]    = useState(false)
  const [newCodes,      setNewCodes]      = useState(null)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await mfaGetStatus()
      setStatus(res.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRegenerate = async () => {
    setRegenerating(true)
    setRegenError(false)
    try {
      const res = await mfaRegenerateRecoveryCodes()
      setNewCodes(res.data.recoveryCodes)
    } catch {
      setRegenError(true)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
    <PasswordSection />
    <SettingsSection
      title="Double authentification"
      desc="La double authentification (MFA) est obligatoire pour tous les comptes administrateur."
    >
      {error && <ErrorBanner onRetry={load} />}
      {loading ? (
        <div className={s.skeletonRow}>
          {[1, 2].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : (
        <>
          <div className={s.mfaStatusRow}>
            <ShieldCheck size={18} className={status?.enabled ? s.mfaEnabledIcon : s.mfaDisabledIcon} />
            <div>
              <p className={s.mfaStatusLabel}>
                {status?.enabled ? 'Double authentification activée' : 'Non activée'}
              </p>
              {status?.enabled && (
                <p className={s.hint}>
                  {status.recoveryCodesRemaining} code{status.recoveryCodesRemaining !== 1 ? 's' : ''} de récupération restant{status.recoveryCodesRemaining !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {status?.enabled && (
            <>
              {regenError && (
                <div className={s.taxNote}>
                  <AlertCircle size={13} />
                  Impossible de régénérer les codes. Veuillez réessayer.
                </div>
              )}
              <div className={s.formActions}>
                <button className={s.btnSave} onClick={handleRegenerate} disabled={regenerating}>
                  <RefreshCw size={14} />
                  {regenerating ? 'Génération…' : 'Régénérer mes codes de récupération'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {newCodes && (
        <RecoveryCodesModal codes={newCodes} onContinue={() => { setNewCodes(null); load() }} />
      )}
    </SettingsSection>
    </>
  )
}

/* ── Page principale ── */
/* Onglets groupés par domaine : l'identité de la boutique, puis ce qui touche
   à la vente, puis le compte. Sans regroupement, « Bandeau » voisinait avec
   « TVA » sans rapport de sens. */
/* `superAdmin` : pages de contenu et blocs promotionnels, réservés au compte
   super-administrateur (ADM-08) — le serveur refuse de toute façon (403). */
const TABS = [
  { key: 'store',    label: 'Boutique',      icon: Store,       desc: 'Nom, email, téléphone',   group: 'Boutique' },
  { key: 'pickup',   label: 'Retrait',       icon: MapPin,      desc: 'Adresse et horaires',     group: 'Boutique' },
  { key: 'home',     label: 'Page d’accueil', icon: House,      desc: 'Bandeau principal, blocs', group: 'Boutique', superAdmin: true },
  { key: 'banner',   label: 'Bandeau',       icon: Megaphone,   desc: 'Annonce en haut du site', group: 'Boutique', superAdmin: true },
  { key: 'about',    label: 'Notre Histoire', icon: BookOpen,   desc: 'Texte de la page « Qui sommes-nous »', group: 'Boutique', superAdmin: true },
  { key: 'emails',   label: 'E-mails',       icon: Mail,        desc: 'Textes envoyés à l’inscription', group: 'Boutique', superAdmin: true },
  { key: 'shipping', label: 'Livraison',     icon: Truck,       desc: 'Tarifs Swiss Post',       group: 'Vente' },
  { key: 'tax',      label: 'TVA',           icon: Receipt,     desc: 'Taux AFC suisses',        group: 'Vente' },
  { key: 'invoice',  label: 'Facturation',   icon: Wallet,      desc: 'Coordonnées, échéance',   group: 'Vente' },
  { key: 'legal',    label: 'Textes légaux', icon: FileText,    desc: 'CGV, mentions, retours',  group: 'Vente', superAdmin: true },
  { key: 'security', label: 'Sécurité',      icon: ShieldCheck, desc: 'Double authentification', group: 'Compte' },
]

export default function Settings() {
  /* L'onglet vit dans l'URL : un lien vers « Paramètres → TVA » devient
     partageable, le bouton Retour ramène à l'onglet précédent, et un
     rafraîchissement ne renvoie plus sur « Boutique ». */
  const [searchParams, setSearchParams] = useSearchParams()
  const { isSuperAdmin } = useAuth()
  const visibleTabs = TABS.filter(t => !t.superAdmin || isSuperAdmin)
  const requested = searchParams.get('onglet')
  const tab = visibleTabs.some(t => t.key === requested) ? requested : 'store'

  /* Un onglet en cours de saisie non enregistrée prévient avant qu'on le quitte.
     Les textes légaux (CGV, mentions) sont de longs textes rédigés à la main :
     changer d'onglet démontait le composant et les perdait sans un mot. */
  const [dirtyTab, setDirtyTab] = useState(null)
  const [pendingTab, setPendingTab] = useState(null)

  const changeTab = (key) => {
    if (key === tab) return
    if (dirtyTab === tab) { setPendingTab(key); return }
    setSearchParams(key === 'store' ? {} : { onglet: key }, { replace: true })
  }

  const confirmLeave = () => {
    const target = pendingTab
    setPendingTab(null)
    setDirtyTab(null)
    setSearchParams(target === 'store' ? {} : { onglet: target }, { replace: true })
  }

  /* Fermeture d'onglet ou rechargement — là où React Router n'a pas la main */
  useEffect(() => {
    if (!dirtyTab) return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyTab])

  /* Passé à chaque onglet : il signale qu'il a des modifications en attente. */
  const markDirty = (key) => (isDirty) => setDirtyTab(prev => (isDirty ? key : prev === key ? null : prev))

  return (
    <div className={s.page}>
      {pendingTab && (
        <ConfirmDialog
          message="Vos modifications ne sont pas enregistrées. Quitter cet onglet ?"
          onConfirm={confirmLeave}
          onClose={() => setPendingTab(null)}
        />
      )}

      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>Paramètres</h1>
        <p className={s.pageDesc}>Configuration générale de la boutique</p>
      </div>

      <div className={s.settingsLayout}>
        <nav className={s.tabs}>
          {visibleTabs.map((t, i) => {
            const Icon = t.icon
            const startsGroup = i === 0 || visibleTabs[i - 1].group !== t.group
            return (
              <div key={`w-${t.key}`} className={s.tabGroup}>
              {startsGroup && <span className={s.tabGroupLabel}>{t.group}</span>}
              <button
                key={t.key}
                className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`}
                onClick={() => changeTab(t.key)}
              >
                <Icon size={15} className={s.tabIcon} />
                <span className={s.tabLabel}>
                  {t.label}
                  {/* Pastille : indique l'onglet qui porte des modifications non
                      enregistrées, y compris une fois qu'on l'a quitté. */}
                  {dirtyTab === t.key && <span className={s.tabDirty} title="Modifications non enregistrées" />}
                </span>
                <span className={s.tabDesc}>{t.desc}</span>
              </button>
              </div>
            )
          })}
        </nav>

        <div className={s.tabContent}>
          {tab === 'store'    && <StoreTab    onDirtyChange={markDirty('store')} />}
          {tab === 'shipping' && <ShippingTab onDirtyChange={markDirty('shipping')} />}
          {tab === 'tax'      && <TaxTab      onDirtyChange={markDirty('tax')} />}
          {tab === 'legal'    && <LegalTab    onDirtyChange={markDirty('legal')} />}
          {tab === 'about'    && <AboutTab    onDirtyChange={markDirty('about')} />}
          {tab === 'home'     && <HomeTab     onDirtyChange={markDirty('home')} />}
          {tab === 'emails'   && <EmailsTab   onDirtyChange={markDirty('emails')} />}
          {tab === 'banner'   && <BannerTab   onDirtyChange={markDirty('banner')} />}
          {tab === 'pickup'   && <PickupTab   onDirtyChange={markDirty('pickup')} />}
          {tab === 'invoice'  && <InvoiceTab  onDirtyChange={markDirty('invoice')} />}
          {tab === 'security' && <SecurityTab />}
        </div>
      </div>
    </div>
  )
}
