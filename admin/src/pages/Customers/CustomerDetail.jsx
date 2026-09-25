import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Phone, MapPin, ShoppingBag, Gift,
  ChevronRight, ShieldCheck, ShieldAlert, Ban, Plus, Trash2,
} from 'lucide-react'
import { getCustomerById, deleteCustomerAddress } from '../../services/customers.service.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { formatCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import { formatDate, formatDateLong, formatRelativeDays } from '../../utils/date.js'
import { formatCustomerNumber } from '../../utils/customerNumber.js'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import CopyButton from '../../components/ui/CopyButton/CopyButton.jsx'
import CustomerIdentityForm from './CustomerIdentityForm.jsx'
import CustomerAddressForm from './CustomerAddressForm.jsx'
import { orderNumber } from '../../utils/orderNumber.js'
import s from './CustomerDetail.module.css'

/* Commandes qui ne comptent ni dans le total ni dans le panier moyen */
const NOT_COUNTED = ['cancelled', 'refunded']

const NEWSLETTER_LABELS = {
  subscribed: 'Oui',
  pending:    'Confirmation en attente',
  none:       'Non',
}

const ADDRESS_TYPE_LABELS = { shipping: 'Livraison', billing: 'Facturation' }

const REWARD_STATUS_LABELS = { available: 'Disponible', used: 'Utilisé', expired: 'Expiré', pending: 'En attente' }

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?'
}

/* Adresse au format La Poste (« NPA Localité », sans canton), prête à coller
   (étiquette, WebStamp, e-mail) */
function postalLines(addr) {
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ')
  return [
    name,
    [addr.street, addr.street_number].filter(Boolean).join(' '),
    [addr.zip, addr.city].filter(Boolean).join(' '),
    addr.country && addr.country !== 'CH' ? addr.country : '',
  ].filter(Boolean)
}

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  const Icon = c.icon
  return (
    <span className={s.statusBadge} style={{ color: c.color, background: c.bg }}>
      {Icon && <Icon size={11} aria-hidden="true" />}
      {c.label}
    </span>
  )
}

/* ── Squelette de chargement — même gabarit que la fiche ── */
function DetailSkeleton() {
  return (
    <div className={s.page} aria-busy="true" aria-label="Chargement de la fiche client">
      <div className={s.head}>
        <span className={`${s.skeleton} ${s.skeletonAvatar}`} />
        <div className={s.skeletonLines}>
          <span className={`${s.skeleton} ${s.skeletonTitle}`} />
          <span className={`${s.skeleton} ${s.skeletonText}`} />
        </div>
      </div>
      <div className={s.layout}>
        <div className={s.aside}>
          <span className={`${s.skeleton} ${s.skeletonCard}`} />
          <span className={`${s.skeleton} ${s.skeletonCard}`} />
        </div>
        <div className={s.main}>
          <span className={`${s.skeleton} ${s.skeletonKpis}`} />
          <span className={`${s.skeleton} ${s.skeletonCardTall}`} />
        </div>
      </div>
    </div>
  )
}

/* ── Fiche client ── */
export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [customer, setCustomer] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)   // 'not_found' | 'network'
  const [editing,  setEditing]  = useState(false)
  // Adresse en cours de saisie : null, 'new' ou l'id de l'adresse modifiée
  const [addressEdit, setAddressEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getCustomerById(Number(id))
      .then(data => {
        if (cancelled) return
        if (data) setCustomer(data)
        else setError('not_found')
      })
      .catch(err => { if (!cancelled) setError(err.response?.status === 404 ? 'not_found' : 'network') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, reloadTick])

  /* Retour : la liste garde sa recherche et sa page (elles sont dans l'URL) */
  const goBack = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/clients')
  }, [navigate])

  const handleSaved = (updated) => {
    if (updated) setCustomer(updated)
    setEditing(false)
    toast.success('Fiche client mise à jour.')
  }

  const handleAddressSaved = (updated) => {
    if (updated) setCustomer(updated)
    toast.success(addressEdit === 'new' ? 'Adresse ajoutée.' : 'Adresse enregistrée.')
    setAddressEdit(null)
  }

  const askDeleteAddress = (addr) => setConfirm({
    message: `Supprimer l'adresse « ${addr.label} » ? Les commandes déjà passées gardent leur adresse de livraison.`,
    onConfirm: async () => {
      try {
        await deleteCustomerAddress(customer.id, addr.id)
        // Rechargée : si c'était l'adresse par défaut, une autre a pris le relais
        setCustomer(await getCustomerById(customer.id))
        toast.success('Adresse supprimée.')
      } catch {
        toast.error('Impossible de supprimer cette adresse. Veuillez réessayer.')
      }
    },
  })

  if (loading && !customer) return <DetailSkeleton />

  if (error === 'not_found') {
    return (
      <div className={s.page}>
        <div className={s.stateBox}>
          <p className={s.stateTitle}>Client introuvable</p>
          <p className={s.stateText}>Ce compte n'existe pas ou a été supprimé.</p>
          <Link to="/clients" className={s.stateLink}>Retour à la liste des clients</Link>
        </div>
      </div>
    )
  }

  if (error === 'network' || !customer) {
    return (
      <div className={s.page}>
        <ErrorBanner onRetry={() => setReloadTick(t => t + 1)} />
      </div>
    )
  }

  const orders    = customer.orders ?? []
  const addresses = customer.addresses ?? []
  const loyalty   = customer.loyalty

  const counted     = orders.filter(o => !NOT_COUNTED.includes(o.status))
  const notCounted  = orders.length - counted.length
  const totalSpent  = counted.reduce((sum, o) => sum + Number(o.total), 0)
  const lastOrder   = orders[0] ?? null
  // Le téléphone vit sur les adresses : celle par défaut d'abord
  const phone = (addresses.find(a => a.is_default && a.phone) ?? addresses.find(a => a.phone))?.phone ?? null
  const verified = !!customer.email_verified_at

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}

      {/* ── En-tête ── */}
      <header className={s.head}>
        <button type="button" className={s.backBtn} onClick={goBack} aria-label="Retour à la liste des clients">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className={s.avatar} aria-hidden="true">{initials(customer.first_name, customer.last_name)}</div>
        <div className={s.headText}>
          <h1 className={s.name}>{customer.first_name} {customer.last_name}</h1>
          <p className={s.headSub}>
            <span className={s.customerNumber}>{formatCustomerNumber(customer.id)}</span>
            <span className={s.dot} aria-hidden="true">·</span>
            Compte créé le {formatDateLong(customer.created_at)}
          </p>
        </div>
      </header>

      {!customer.is_active && (
        <div className={s.alert} role="status">
          <Ban size={15} aria-hidden="true" />
          <span><strong>Compte désactivé</strong> — la connexion à la boutique est refusée.</span>
        </div>
      )}

      <div className={s.layout}>

        {/* ── Colonne identité : qui est-elle, comment la joindre ── */}
        <div className={s.aside}>

          <section className={s.card} aria-labelledby="contact-title">
            <div className={s.cardHead}>
              <h2 id="contact-title" className={s.cardTitle}>Coordonnées</h2>
              {!editing && (
                <button type="button" className={`${s.ghostBtn} ${s.pushRight}`} onClick={() => setEditing(true)}>
                  <Pencil size={13} aria-hidden="true" /> Modifier
                </button>
              )}
            </div>

            {editing ? (
              <CustomerIdentityForm
                customer={customer}
                onSaved={handleSaved}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <dl className={s.facts}>
                <div className={s.fact}>
                  <dt className={s.factLabel}>E-mail</dt>
                  <dd className={s.factValue}>
                    <div className={s.valueRow}>
                      <a href={`mailto:${customer.email}`} className={s.link}>{customer.email}</a>
                      <CopyButton text={customer.email} label="Copier l'adresse e-mail" />
                    </div>
                    {verified ? (
                      <span className={`${s.chip} ${s.chipSuccess}`}>
                        <ShieldCheck size={12} aria-hidden="true" /> Adresse vérifiée
                      </span>
                    ) : (
                      <>
                        <span className={`${s.chip} ${s.chipWarning}`}>
                          <ShieldAlert size={12} aria-hidden="true" /> Adresse non vérifiée
                        </span>
                        <span className={s.factHint}>
                          Elle doit cliquer sur le lien reçu par e-mail avant de pouvoir commander.
                        </span>
                      </>
                    )}
                  </dd>
                </div>

                <div className={s.fact}>
                  <dt className={s.factLabel}>Téléphone</dt>
                  <dd className={s.factValue}>
                    {phone ? (
                      <div className={s.valueRow}>
                        <a href={`tel:${phone.replace(/\s+/g, '')}`} className={s.link}>{phone}</a>
                        <CopyButton text={phone} label="Copier le numéro" />
                      </div>
                    ) : (
                      <span className={s.muted}>Non renseigné</span>
                    )}
                  </dd>
                </div>

                <div className={s.fact}>
                  <dt className={s.factLabel}>Newsletter</dt>
                  <dd className={s.factValue}>
                    {NEWSLETTER_LABELS[customer.newsletter_status] ?? NEWSLETTER_LABELS.none}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section className={s.card} aria-labelledby="addresses-title">
            <div className={s.cardHead}>
              <h2 id="addresses-title" className={s.cardTitle}>
                <MapPin size={14} aria-hidden="true" /> Adresses
              </h2>
              {addresses.length > 0 && <span className={s.count}>{addresses.length}</span>}
              {addressEdit === null && addresses.length > 0 && (
                <button type="button" className={`${s.ghostBtn} ${s.pushRight}`} onClick={() => setAddressEdit('new')}>
                  <Plus size={13} aria-hidden="true" /> Ajouter
                </button>
              )}
            </div>

            {addressEdit === 'new' && (
              <CustomerAddressForm
                customerId={customer.id}
                isFirst={addresses.length === 0}
                onSaved={handleAddressSaved}
                onCancel={() => setAddressEdit(null)}
              />
            )}

            {addresses.length === 0 ? (
              addressEdit !== 'new' && (
                <div className={s.emptyAction}>
                  <p className={s.emptyText}>Aucune adresse enregistrée.</p>
                  <button type="button" className={s.ghostBtn} onClick={() => setAddressEdit('new')}>
                    <Plus size={13} aria-hidden="true" /> Ajouter une adresse
                  </button>
                </div>
              )
            ) : (
              <ul className={s.addressList}>
                {addresses.map(addr => {
                  if (addressEdit === addr.id) {
                    return (
                      <li key={addr.id}>
                        <CustomerAddressForm
                          customerId={customer.id}
                          address={addr}
                          onSaved={handleAddressSaved}
                          onCancel={() => setAddressEdit(null)}
                        />
                      </li>
                    )
                  }
                  const lines = postalLines(addr)
                  return (
                    <li key={addr.id} className={s.address}>
                      <div className={s.addressHead}>
                        <div className={s.addressTitle}>
                          <span className={s.addressLabel}>{addr.label}</span>
                          {!!addr.is_default && <span className={`${s.chip} ${s.chipRose}`}>Par défaut</span>}
                          {ADDRESS_TYPE_LABELS[addr.address_type] && (
                            <span className={s.chip}>{ADDRESS_TYPE_LABELS[addr.address_type]}</span>
                          )}
                        </div>
                        <span className={s.addressActions}>
                          <CopyButton text={lines.join('\n')} label="Copier l'adresse" />
                          <button
                            type="button"
                            className={s.iconBtn}
                            onClick={() => setAddressEdit(addr.id)}
                            aria-label={`Modifier l'adresse ${addr.label}`}
                            title="Modifier"
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={`${s.iconBtn} ${s.iconBtnDanger}`}
                            onClick={() => askDeleteAddress(addr)}
                            aria-label={`Supprimer l'adresse ${addr.label}`}
                            title="Supprimer"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                      <address className={s.postal}>
                        {lines.map(line => <span key={line}>{line}</span>)}
                      </address>
                      {addr.phone && (
                        <a href={`tel:${addr.phone.replace(/\s+/g, '')}`} className={s.addressPhone}>
                          <Phone size={12} aria-hidden="true" /> {addr.phone}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={s.card} aria-labelledby="loyalty-title">
            <div className={s.cardHead}>
              <h2 id="loyalty-title" className={s.cardTitle}>
                <Gift size={14} aria-hidden="true" /> Fidélité
              </h2>
              {loyalty?.tier_name && <span className={`${s.chip} ${s.chipRose} ${s.pushRight}`}>{loyalty.tier_name}</span>}
            </div>

            {!loyalty ? (
              <p className={s.empty}>Aucun achat comptabilisé pour l'instant.</p>
            ) : (
              <div className={s.loyalty}>
                <p className={s.loyaltyTotal}>
                  <span className={s.loyaltyAmount}>{formatCHF(loyalty.total_spend_chf)}</span> cumulés
                </p>

                {loyalty.next_tier && (() => {
                  const target  = loyalty.next_tier.min_spend_chf
                  const percent = Math.min(100, Math.round((loyalty.total_spend_chf / target) * 100))
                  return (
                    <div className={s.progress}>
                      <div
                        className={s.progressTrack}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-label={`Progression vers le palier ${loyalty.next_tier.name}`}
                      >
                        <span className={s.progressFill} style={{ transform: `scaleX(${percent / 100})` }} />
                      </div>
                      <p className={s.progressText}>
                        Encore <strong>{formatCHF(target - loyalty.total_spend_chf)}</strong> pour
                        atteindre « {loyalty.next_tier.name} »
                      </p>
                    </div>
                  )
                })()}

                {(loyalty.rewards ?? []).length > 0 && (
                  <ul className={s.rewards}>
                    {loyalty.rewards.map(r => (
                      <li key={r.code} className={s.reward} data-status={r.status}>
                        <span className={s.rewardCode}>{r.code}</span>
                        <span className={s.rewardValue}>
                          {r.type === 'fixed' ? formatCHF(r.value) : `${Number(r.value)} %`}
                        </span>
                        <span className={s.rewardStatus}>
                          {REWARD_STATUS_LABELS[r.status] ?? r.status}
                          {r.status === 'available' && r.expires_at && ` · jusqu'au ${formatDate(r.expires_at)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── Colonne activité : ce qu'elle achète ── */}
        <div className={s.main}>

          <dl className={s.kpis}>
            <div className={s.kpi}>
              <dt className={s.kpiLabel}>Commandes</dt>
              <dd className={s.kpiValue}>{orders.length}</dd>
              {notCounted > 0 && (
                <dd className={s.kpiSub}>dont {notCounted} annulée{notCounted > 1 ? 's' : ''} ou remboursée{notCounted > 1 ? 's' : ''}</dd>
              )}
            </div>
            <div className={s.kpi}>
              <dt className={s.kpiLabel}>Total commandé</dt>
              <dd className={s.kpiValue}>{formatCHF(totalSpent)}</dd>
              {notCounted > 0 && <dd className={s.kpiSub}>hors annulations</dd>}
            </div>
            <div className={s.kpi}>
              <dt className={s.kpiLabel}>Panier moyen</dt>
              <dd className={s.kpiValue}>{counted.length ? formatCHF(totalSpent / counted.length) : '—'}</dd>
            </div>
            <div className={s.kpi}>
              <dt className={s.kpiLabel}>Dernière commande</dt>
              <dd className={s.kpiValue}>{lastOrder ? formatRelativeDays(lastOrder.created_at) : '—'}</dd>
              {lastOrder && <dd className={s.kpiSub}>{formatDate(lastOrder.created_at)}</dd>}
            </div>
          </dl>

          <section className={s.card} aria-labelledby="orders-title">
            <div className={s.cardHead}>
              <h2 id="orders-title" className={s.cardTitle}>
                <ShoppingBag size={14} aria-hidden="true" /> Commandes
              </h2>
            </div>

            {orders.length === 0 ? (
              <p className={s.empty}>Aucune commande pour l'instant.</p>
            ) : (
              <ul className={s.orderList}>
                {orders.map(o => (
                  <li key={o.id}>
                    <Link
                      to={`/commandes/${o.id}`}
                      className={s.orderRow}
                      data-muted={NOT_COUNTED.includes(o.status)}
                    >
                      <span className={s.orderRef}>
                        {/* N° de commande = n° de facture */}
                        <span className={s.orderId}>{orderNumber(o)}</span>
                      </span>
                      <span className={s.orderDate}>{formatDate(o.created_at)}</span>
                      <span className={s.orderStatus}><StatusBadge status={o.status} /></span>
                      <span className={s.orderTotal}>{formatCHF(o.total)}</span>
                      <ChevronRight size={16} className={s.orderChevron} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
