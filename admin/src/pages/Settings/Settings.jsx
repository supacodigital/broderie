import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Save, AlertCircle, Plus, Trash2 } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SettingsSection, { SaveFeedback } from '../../components/ui/SettingsSection/SettingsSection.jsx'
import { useDirtyTracker } from '../../hooks/useDirtyTracker.js'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx'
import SecurityTab from './SecurityTab.jsx'
import { SETTINGS_TABS, resolveSettingsTab } from './settingsTabs.js'
import {
  getStoreSettings,
  updateStoreSettings,
  getTaxRates,
  updateTaxRates,
  getShippingRates,
  updateShippingRates,
  getPickupSettings,
  updatePickupSettings,
  getInvoiceSettings,
  updateInvoiceSettings,
} from '../../services/settings.service.js'
import s from './Settings.module.css'

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

  /* Une ligne = une tranche de montant (ADM-10 — « le modèle par tranches de
     poids est inadapté »). Seul le plafond se saisit : chaque tranche commence
     là où finit la précédente. La dernière n'a pas de plafond (« au-delà ») ;
     seule, elle fait un forfait. `key` identifie la ligne à l'écran. */
  const toRows = (list) => (list ?? []).map((r, i) => ({
    key:           `r${r.id ?? i}`,
    maxAmount:     r.max_amount_chf === null || r.max_amount_chf === undefined ? null : String(parseFloat(r.max_amount_chf)),
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

  const ceilingOf = (r) => (r.maxAmount === null ? Infinity : (parseFloat(r.maxAmount) || 0))

  // Nouvelle tranche insérée avant « au-delà », 50 francs au-dessus du plus haut plafond
  const addTier = () => {
    const highest = Math.max(0, ...rates.filter(r => r.maxAmount !== null).map(ceilingOf))
    const open = rates.find(r => r.maxAmount === null)
    setRates(prev => [...prev, { key: `n${Date.now()}`, maxAmount: String(highest + 50), priceChf: open?.priceChf ?? '', estimatedDays: open?.estimatedDays ?? '' }])
  }

  const removeTier = (key) => setRates(prev => prev.filter(r => r.key !== key))

  // Bornes affichées dans l'ordre des montants, comme elles s'appliqueront
  const sorted = [...rates].sort((a, b) => ceilingOf(a) - ceilingOf(b))
  const lowerBound = (key) => {
    const i = sorted.findIndex(r => r.key === key)
    return i <= 0 ? 0 : ceilingOf(sorted[i - 1])
  }
  const chf = (n) => `CHF ${Number(n).toFixed(2)}`

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    setErrorMsg('')
    try {
      const payload = sorted.map(r => ({
        maxAmountChf:  r.maxAmount === null ? null : parseFloat(r.maxAmount),
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
      desc="Livraison Suisse uniquement via La Poste CH. Les frais sont toujours facturés au client, selon le montant des articles (TTC, avant code promo). Une seule tranche = un forfait pour toutes les commandes."
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
              <span>Montant des articles</span>
              <span>Tarif (CHF)</span>
              <span>Délai estimé</span>
              <span aria-hidden="true" />
            </div>
            {sorted.map(r => (
              <div key={r.key} className={`${s.shippingRow} ${s.shippingGrid}`}>
                <div className={s.weightCell}>
                  {r.maxAmount === null ? (
                    <span className={s.weightFrom}>
                      {sorted.length === 1 ? 'Toutes les commandes (forfait)' : `au-delà de ${chf(lowerBound(r.key))}`}
                    </span>
                  ) : (
                    <>
                      <span className={s.weightFrom}>de {chf(lowerBound(r.key))} à CHF</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        className={`${s.input} ${s.inputWeight}`}
                        aria-label="Montant maximum de la tranche (CHF)"
                        value={r.maxAmount}
                        onChange={e => handleChange(r.key, 'maxAmount', e.target.value)}
                      />
                    </>
                  )}
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
                  disabled={rates.length <= 1 || r.maxAmount === null}
                  aria-label="Supprimer cette tranche"
                  title="Supprimer cette tranche"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className={s.hint}>
            La dernière ligne s’applique à tous les montants au-delà du dernier plafond. Aucun poids à saisir sur les articles.
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
          Les frais de port facturés à la cliente dépendent du montant des articles (grille ci-dessus), plus de leur poids. Le champ <strong>Poids</strong> des fiches produit ne sert qu’au poids déclaré sur l’étiquette La Poste générée depuis l’administration : un article sans poids y compte pour 0.2 kg.
        </p>
      </div>
    </SettingsSection>
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

/* ── Page principale ── */
export default function Settings() {
  /* L'onglet vit dans l'URL : un lien vers « Paramètres → TVA » devient
     partageable, le bouton Retour ramène à l'onglet précédent, et un
     rafraîchissement ne renvoie plus sur « Boutique ». Il se choisit dans le
     menu latéral, sous « Paramètres » : la colonne d'onglets de la page a
     disparu (26.09). */
  const [searchParams] = useSearchParams()
  const tab = resolveSettingsTab(searchParams.get('onglet'))
  const current = SETTINGS_TABS.find(t => t.key === tab)

  /* Un onglet en cours de saisie non enregistrée prévient avant qu'on le quitte :
     changer d'onglet démontait le composant et perdait la saisie sans un mot.
     L'état remonte au garde-fou commun, que le menu consulte avant de changer
     d'onglet ou de page (il couvre aussi la fermeture de l'onglet du navigateur). */
  const [dirtyTab, setDirtyTab] = useState(null)
  const { setDirty } = useUnsavedChanges()
  useEffect(() => { setDirty(dirtyTab !== null) }, [dirtyTab, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  /* Onglet choisi dans le menu, parfois tout en bas d'une longue page :
     le nouvel onglet s'affiche depuis son début */
  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  /* Passé à chaque onglet : il signale qu'il a des modifications en attente. */
  const markDirty = (key) => (isDirty) => setDirtyTab(prev => (isDirty ? key : prev === key ? null : prev))

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>
          Paramètres <span className={s.pageTitleSep}>·</span> {current.label}
        </h1>
        <p className={s.pageDesc}>{current.desc}</p>
      </div>

      <div className={s.tabContent}>
        {tab === 'store'    && <StoreTab    onDirtyChange={markDirty('store')} />}
        {tab === 'shipping' && <ShippingTab onDirtyChange={markDirty('shipping')} />}
        {tab === 'tax'      && <TaxTab      onDirtyChange={markDirty('tax')} />}
        {tab === 'pickup'   && <PickupTab   onDirtyChange={markDirty('pickup')} />}
        {tab === 'invoice'  && <InvoiceTab  onDirtyChange={markDirty('invoice')} />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </div>
  )
}
