import { useTranslation } from 'react-i18next'
import { Truck, Shield, Package } from 'lucide-react'
import { useHomeContent } from '../../../hooks/useHomeContent.js'
import { previewTarget } from '../../../utils/livePreview.js'
import s from './AdvantagesSection.module.css'

const ICONS = [
  <Truck size={22} />,
  <Shield size={22} />,
  <Package size={22} />,
]

const KEYS = ['shipping', 'payment', 'packaging']

export default function AdvantagesSection() {
  const { t } = useTranslation()
  // Textes modifiables depuis Paramètres → Page d'accueil (ADM-08)
  const { text, style } = useHomeContent()

  return (
    <section className={s.section} aria-label="Nos avantages">
      <div className={s.grid}>
        {KEYS.map((key, i) => (
          <div key={key} className={s.item}>
            <div className={s.iconWrap} aria-hidden="true">{ICONS[i]}</div>
            <div>
              <p className={s.title} style={style(`advantage_${i + 1}_title`)} {...previewTarget(`advantage_${i + 1}_title`)}>{text(`advantage_${i + 1}_title`, t(`advantages.${key}.title`))}</p>
              <p className={s.desc} style={style(`advantage_${i + 1}_desc`)} {...previewTarget(`advantage_${i + 1}_desc`)}>{text(`advantage_${i + 1}_desc`, t(`advantages.${key}.desc`))}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
