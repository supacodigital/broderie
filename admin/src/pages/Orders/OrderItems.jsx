import { useState } from 'react'
import { Package, ShoppingBag } from 'lucide-react'
import Card from '../../components/ui/Card/Card.jsx'
import { formatCHF, formatCents } from '../../utils/chf.js'
import { lineQuantityLabel, lineUnitSuffix } from '../../utils/stock.js'
import s from './OrderItems.module.css'

const snapshotOf = (item) => (typeof item.product_snapshot_json === 'string'
  ? JSON.parse(item.product_snapshot_json)
  : (item.product_snapshot_json ?? {}))

/* Photo principale de l'article ; l'icône reste si le produit n'en a pas ou
   si l'image ne se charge pas (fichier supprimé depuis la commande). */
function ItemThumb({ src, name }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <span className={s.thumb} aria-hidden="true"><Package size={16} /></span>
  }
  return (
    <img
      className={s.thumbImg}
      src={src}
      alt={name}
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

/* Articles commandés et totaux, lus comme une facture : les lignes, puis
   sous-total, remise, livraison, TVA incluse et total. */
export default function OrderItems({ order }) {
  const items    = order.items ?? []
  const discount = Number(order.discount) || 0

  return (
    <Card
      title="Articles"
      icon={ShoppingBag}
      aside={<span className={s.count}>{items.length} article{items.length > 1 ? 's' : ''}</span>}
    >
      <ul className={s.list}>
        {items.map(item => {
          const p = snapshotOf(item)
          const unitPrice = parseFloat(item.unit_price)
          /* Prix normal ramené à l'unité facturée par le serveur (CLI-14) :
             au tronçon pour la coupe — le snapshot, lui, est au mètre. */
          const comparePrice = item.compare_unit_price != null ? parseFloat(item.compare_unit_price) : null
          const onSale = comparePrice != null && comparePrice > unitPrice
          return (
            <li key={item.id} className={s.row}>
              <ItemThumb src={item.image_url} name={p.name ?? `Produit #${item.product_id}`} />
              <div className={s.info}>
                <span className={s.name}>{p.name ?? `Produit #${item.product_id}`}</span>
                <span className={s.meta}>
                  {p.sku && <span className={s.sku}>{p.sku}</span>}
                  {onSale && <span className={s.sale}>En action</span>}
                </span>
              </div>
              <div className={s.qty}>
                <span className={s.qtyValue}>{item.sold_by_length ? lineQuantityLabel(item) : `× ${item.quantity}`}</span>
                <span className={s.unit}>
                  {formatCHF(unitPrice)}{lineUnitSuffix(item)}
                  {onSale && <del className={s.was}>{formatCHF(comparePrice)}</del>}
                </span>
              </div>
              <span className={s.lineTotal}>{formatCHF(unitPrice * item.quantity)}</span>
            </li>
          )
        })}
      </ul>

      {/* Code promo : `subtotal` est stocké après remise — comme sur la
          facture, les articles puis la remise */}
      <dl className={s.totals}>
        <div className={s.totalRow}>
          <dt>Sous-total articles</dt>
          <dd>{formatCHF(Number(order.subtotal) + discount)}</dd>
        </div>
        {discount > 0 && (
          <div className={s.totalRow}>
            <dt>Remise{order.coupon_code ? ` (${order.coupon_code})` : ''}</dt>
            <dd>− {formatCHF(discount)}</dd>
          </div>
        )}
        <div className={s.totalRow}>
          <dt>Livraison</dt>
          <dd>{formatCHF(order.shipping_cost)}</dd>
        </div>
        <div className={s.totalRow}>
          <dt>TVA incluse</dt>
          {/* TVA au centime, comme sur la facture (ADM-14) */}
          <dd>{formatCents(order.tax_amount)}</dd>
        </div>
        <div className={`${s.totalRow} ${s.grandTotal}`}>
          <dt>Total TTC</dt>
          <dd>{formatCHF(order.total)}</dd>
        </div>
      </dl>
    </Card>
  )
}
