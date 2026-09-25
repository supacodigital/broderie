import { Link } from 'react-router-dom'
import { Mail, Phone, Store, User } from 'lucide-react'
import Card from '../../components/ui/Card/Card.jsx'
import CopyButton from '../../components/ui/CopyButton/CopyButton.jsx'
import { formatCustomerNumber } from '../../utils/customerNumber.js'
import s from './OrderCustomer.module.css'

// Adresse figée sur la commande, au format La Poste : « NPA Localité », sans canton
function addressLines(order, prefix) {
  const name = [order[`${prefix}_first_name`], order[`${prefix}_last_name`]].filter(Boolean).join(' ')
  const street = [order[`${prefix}_street`], order[`${prefix}_street_number`]].filter(Boolean).join(' ')
  const city = [order[`${prefix}_zip`], order[`${prefix}_city`]].filter(Boolean).join(' ')
  const country = order[`${prefix}_country`]
  return [name, street, city.trim(), country && country !== 'CH' ? country : ''].filter(Boolean)
}

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?'
}

/* Qui a commandé et où livrer : de quoi répondre au téléphone et préparer
   l'envoi sans ouvrir la fiche cliente. */
export default function OrderCustomer({ order, pickup }) {
  const shipping = order.shipping_street ? addressLines(order, 'shipping') : []
  const billingDiffers = order.billing_street && order.billing_street !== order.shipping_street
  const billing = billingDiffers ? addressLines(order, 'billing') : []
  const phone = order.shipping_phone

  return (
    <Card title="Cliente" icon={User}>
      <div className={s.identity}>
        <span className={s.avatar} aria-hidden="true">{initials(order.first_name, order.last_name)}</span>
        <div className={s.identityText}>
          {order.user_id ? (
            <Link to={`/clients/${order.user_id}`} className={s.name}>{order.first_name} {order.last_name}</Link>
          ) : (
            <span className={s.name}>{order.first_name} {order.last_name}</span>
          )}
          {order.user_id && <span className={s.number}>{formatCustomerNumber(order.user_id)}</span>}
        </div>
      </div>

      <ul className={s.contacts}>
        <li className={s.contact}>
          <Mail size={13} aria-hidden="true" />
          <a href={`mailto:${order.email}`} className={s.link}>{order.email}</a>
          <CopyButton text={order.email} label="Copier l'adresse e-mail" />
        </li>
        {phone && (
          <li className={s.contact}>
            <Phone size={13} aria-hidden="true" />
            <a href={`tel:${phone.replace(/\s+/g, '')}`} className={s.link}>{phone}</a>
            <CopyButton text={phone} label="Copier le numéro" />
          </li>
        )}
      </ul>

      <div className={s.block}>
        <h3 className={s.blockTitle}>{pickup ? 'Retrait' : 'Livraison'}</h3>
        {pickup ? (
          <p className={s.pickup}>
            <Store size={13} aria-hidden="true" /> Retrait en boutique
          </p>
        ) : shipping.length ? (
          <div className={s.addressRow}>
            <address className={s.address}>
              {shipping.map(line => <span key={line}>{line}</span>)}
            </address>
            <CopyButton text={shipping.join('\n')} label="Copier l'adresse de livraison" />
          </div>
        ) : (
          <p className={s.missing}>Aucune adresse enregistrée</p>
        )}
      </div>

      {billing.length > 0 && (
        <div className={s.block}>
          <h3 className={s.blockTitle}>Facturation</h3>
          <div className={s.addressRow}>
            <address className={s.address}>
              {billing.map(line => <span key={line}>{line}</span>)}
            </address>
            <CopyButton text={billing.join('\n')} label="Copier l'adresse de facturation" />
          </div>
        </div>
      )}
    </Card>
  )
}
