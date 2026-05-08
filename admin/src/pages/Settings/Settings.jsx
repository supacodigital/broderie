import { useEffect, useState, useCallback } from 'react'
import { Save, Check, AlertCircle, AlertTriangle } from 'lucide-react'
import api from '../../services/api.js'
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
function StoreTab() {
  const [values,  setValues]  = useState({ store_name: '', store_email: '', store_phone: '', store_address: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await api.get('/admin/settings/store')
      setValues(prev => ({ ...prev, ...res.data.data }))
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
      await api.put('/admin/settings/store', values)
      setStatus('saved')
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
      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={13} />
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}
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
function TaxTab() {
  const [rates,   setRates]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await api.get('/admin/settings/tax-rates')
      setRates(res.data.data ?? [])
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
      const res = await api.put('/admin/settings/tax-rates', { rates: payload })
      setRates(res.data.data ?? rates)
      setStatus('saved')
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
      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={13} />
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}
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
            Les taux TVA sont figés sur chaque commande au moment de l'achat (<code>tax_rate_snapshot</code>).
            Une modification n'affecte que les nouvelles commandes.
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

/* ── Onglet Livraison ── */
function ShippingTab() {
  const [rates,   setRates]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await api.get('/admin/settings/shipping')
      setRates(res.data.data ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (id, field, value) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const payload = rates.map(r => ({
        id:            r.id,
        priceChf:      parseFloat(r.price_chf),
        estimatedDays: r.estimated_days,
      }))
      const res = await api.put('/admin/settings/shipping', { rates: payload })
      setRates(res.data.data ?? rates)
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 3000)
    }
  }

  return (
    <SettingsSection
      title="Frais de port"
      desc="Livraison Suisse uniquement via La Poste CH. Les frais sont toujours facturés au client."
    >
      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={13} />
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}
      {loading ? (
        <div className={s.skeletonList}>
          {[1,2,3].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : rates.length === 0 ? (
        <p className={s.empty}>Aucun tarif de livraison configuré.</p>
      ) : (
        <>
          <div className={s.shippingTable}>
            <div className={s.shippingHead}>
              <span>Tranche de poids</span>
              <span>Tarif (CHF)</span>
              <span>Délai estimé</span>
            </div>
            {rates.map(r => (
              <div key={r.id} className={s.shippingRow}>
                <span className={s.weightRange}>
                  {parseFloat(r.min_weight)} – {parseFloat(r.max_weight)} kg
                </span>
                <div className={s.inputWrap}>
                  <span className={s.inputPrefix}>CHF</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    className={`${s.input} ${s.inputWithPrefix} ${s.inputSm}`}
                    value={r.price_chf}
                    onChange={e => handleChange(r.id, 'price_chf', e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  className={`${s.input} ${s.inputSm}`}
                  placeholder="ex: 1-2 jours"
                  value={r.estimated_days ?? ''}
                  onChange={e => handleChange(r.id, 'estimated_days', e.target.value)}
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

/* ── Onglet Textes légaux ── */
function LegalTab() {
  const [values,  setValues]  = useState({ cgv: '', mentions_legales: '', politique_retour: '' })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [status,  setStatus]  = useState(null)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await api.get('/admin/settings/legal')
      setValues(prev => ({ ...prev, ...res.data.data }))
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
      await api.put('/admin/settings/legal', values)
      setStatus('saved')
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
      desc:  'Droit de retour 14 jours recommandé (7 jours légal selon CO).',
    },
  ]

  return (
    <>
      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={13} />
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}

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

/* ── Page principale ── */
const TABS = [
  { key: 'store',    label: 'Boutique'       },
  { key: 'shipping', label: 'Livraison'      },
  { key: 'tax',      label: 'TVA'            },
  { key: 'legal',    label: 'Textes légaux'  },
]

export default function Settings() {
  const [tab, setTab] = useState('store')

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>Paramètres</h1>
        <p className={s.pageDesc}>Configuration générale de la boutique</p>
      </div>

      <div className={s.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={s.tabContent}>
        {tab === 'store'    && <StoreTab />}
        {tab === 'shipping' && <ShippingTab />}
        {tab === 'tax'      && <TaxTab />}
        {tab === 'legal'    && <LegalTab />}
      </div>
    </div>
  )
}
