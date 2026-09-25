import { History } from 'lucide-react'
import Card from '../../components/ui/Card/Card.jsx'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import { formatDateTime } from '../../utils/date.js'
import s from './OrderHistory.module.css'

/* Chronologie des statuts, la plus récente en haut : c'est celle qu'on cherche */
export default function OrderHistory({ history }) {
  const entries = [...(history ?? [])].reverse()
  if (entries.length === 0) return null

  return (
    <Card title="Historique" icon={History}>
      <ol className={s.timeline}>
        {entries.map((h, i) => {
          const cfg = STATUS_CFG[h.status] ?? { label: h.status, dot: '#9ca3af' }
          return (
            <li key={i} className={s.entry}>
              <span className={s.dot} style={{ background: cfg.dot ?? cfg.color }} aria-hidden="true" />
              <div className={s.content}>
                <div className={s.line}>
                  <span className={s.status}>{cfg.label}</span>
                  <time className={s.date} dateTime={h.created_at}>{formatDateTime(h.created_at)}</time>
                </div>
                {h.note && <p className={s.note}>{h.note}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
