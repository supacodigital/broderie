import { useTranslation } from 'react-i18next'
import { Truck, Shield, Package } from 'lucide-react'
import s from './AdvantagesSection.module.css'

const ICONS = [
  <Truck size={22} />,
  <Shield size={22} />,
  <Package size={22} />,
]

const KEYS = ['shipping', 'payment', 'packaging']

export default function AdvantagesSection() {
  const { t } = useTranslation()

  return (
    <section className={s.section} aria-label="Nos avantages">
      <div className={s.grid}>
        {KEYS.map((key, i) => (
          <div key={key} className={s.item}>
            <div className={s.iconWrap} aria-hidden="true">{ICONS[i]}</div>
            <div>
              <p className={s.title}>{t(`advantages.${key}.title`)}</p>
              <p className={s.desc}>{t(`advantages.${key}.desc`)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
