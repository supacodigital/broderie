import { describe, it, expect } from 'vitest'
import { buildSteps, currentStage, isPickupOrder } from './orderFlow.js'

const states = (order) => Object.fromEntries(buildSteps(order).map(st => [st.key, st.state]))

describe('orderFlow — parcours de la commande', () => {
  it('livraison payée en ligne : préparation en cours', () => {
    expect(states({ status: 'paid', paid_at: '2026-09-25', payment_method: 'twint' })).toEqual({
      received: 'done', paid: 'done', processing: 'current', shipped: 'todo', delivered: 'todo',
    })
  })

  it('livrée : tout est fait', () => {
    expect(Object.values(states({ status: 'delivered', paid_at: '2026-09-25', payment_method: 'card' })).every(v => v === 'done')).toBe(true)
  })

  it('retrait : parcours en trois étapes, prête puis payée et retirée', () => {
    const order = { status: 'ready_for_pickup', payment_method: 'pickup' }
    expect(isPickupOrder(order)).toBe(true)
    expect(states(order)).toEqual({ received: 'done', ready: 'done', collected: 'current' })
    expect(currentStage(order).kind).toBe('pickup_ready')
  })

  it('paiement en ligne refusé : bandeau rouge et relance possible', () => {
    const stage = currentStage({ status: 'payment_failed', payment_method: 'card' })
    expect(stage).toMatchObject({ kind: 'online_unpaid', tone: 'danger', title: 'Paiement refusé' })
  })

  it('annulée ou remboursée : aucune action', () => {
    expect(currentStage({ status: 'cancelled' }).kind).toBe('closed')
    expect(currentStage({ status: 'refunded' }).kind).toBe('closed')
  })
})
