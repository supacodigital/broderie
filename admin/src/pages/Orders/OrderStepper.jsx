import { Check, Clock } from 'lucide-react'
import s from './OrderStepper.module.css'

const STATE_LABELS = { done: 'terminée', current: 'en cours', waiting: 'en attente', todo: 'à venir' }

/* Frise du parcours de la commande. « waiting » : étape restée en attente alors
   que la suite a avancé (facture expédiée avant d'être payée). */
export default function OrderStepper({ steps }) {
  return (
    <ol className={s.stepper}>
      {steps.map((step, i) => (
        <li key={step.key} className={s.step} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className={s.marker} aria-hidden="true">
            {step.state === 'done' ? <Check size={13} strokeWidth={3} />
              : step.state === 'waiting' ? <Clock size={12} strokeWidth={2.5} />
              : i + 1}
          </span>
          <span className={s.label}>
            {step.label}
            <span className={s.srOnly}> — étape {STATE_LABELS[step.state]}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
