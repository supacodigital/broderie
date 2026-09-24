import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PriceHistory from './PriceHistory.jsx'

vi.mock('../../services/products.service.js', () => ({
  getPriceHistory: vi.fn(),
}))

import { getPriceHistory } from '../../services/products.service.js'

/* ADM-21 — chaque ligne décrit l'offre en vigueur à partir de sa date :
   prix normal, prix promo et période. La plus récente est en tête. */
const ROWS = [
  { id: 3, source: 'admin', changed_by_first_name: 'Julie', changed_by_last_name: 'Guerle',
    changed_at: '2026-09-24T08:00:00', new_price_chf: '84.50', new_compare_price_chf: '119.00',
    promo_starts_at: '2026-10-01T00:00:00', promo_ends_at: '2026-10-15T23:59:00' },
  { id: 2, source: 'script', changed_at: '2026-09-20T08:00:00',
    new_price_chf: '1.50', new_compare_price_chf: '2.00', promo_starts_at: null, promo_ends_at: null },
  { id: 1, source: 'initial', changed_at: '2026-09-03T14:24:00',
    new_price_chf: '99.00', new_compare_price_chf: null, promo_starts_at: null, promo_ends_at: null },
]

describe('PriceHistory — historique des prix (ADM-21)', () => {
  beforeEach(() => {
    getPriceHistory.mockResolvedValue({ data: ROWS, pagination: { total: 3 } })
  })

  const openPanel = async () => {
    render(<PriceHistory productId={1} />)
    await userEvent.click(screen.getByRole('button', { name: /Historique des prix/ }))
    return screen.findAllByRole('row')
  }

  it('présente chaque offre : prix normal, prix promo et période', async () => {
    const [, current, scripted, initial] = await openPanel()

    expect(within(current).getByText('En vigueur')).toBeInTheDocument()
    expect(within(current).getByText('CHF 119.00')).toBeInTheDocument()
    expect(within(current).getByText('CHF 84.50')).toBeInTheDocument()
    expect(within(current).getByText('du 01.10.2026 au 15.10.2026')).toBeInTheDocument()
    expect(within(current).getByText('Julie Guerle')).toBeInTheDocument()

    expect(within(scripted).getByText('Mise à jour en masse')).toBeInTheDocument()

    // Le prix de départ ouvre l'historique de chaque produit
    expect(within(initial).getByText('Prix initial')).toBeInTheDocument()
    expect(within(initial).getByText('CHF 99.00')).toBeInTheDocument()
  })

  // Un prix barré sans fin est ce que l'ordonnance sur l'indication des prix limite
  it('signale un prix barré sans date de fin', async () => {
    const [, , scripted] = await openPanel()
    expect(within(scripted).getByText('sans date de fin')).toBeInTheDocument()
  })
})
