import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CartDrawer from './CartDrawer.jsx'

/* CLI-14 — « le client ne voit pas que l'article est en promotion/action » :
   le volet du panier affiche la mention « En action » avec la remise, et le
   prix normal de la ligne barré à côté du prix payé. */

vi.mock('react-i18next', async () => {
  const fr = (await import('../../../i18n/fr/common.json')).default
  const get = (key, vars = {}) => {
    const raw = key.split('.').reduce((o, k) => o?.[k], fr) ?? key
    return typeof raw === 'string' ? raw.replace(/\{\{(\w+)\}\}/g, (_, v) => vars[v] ?? '') : key
  }
  return { useTranslation: () => ({ t: get, i18n: { language: 'fr' } }) }
})

vi.mock('../../../contexts/CartDrawerContext.jsx', () => ({
  useCartDrawer: () => ({ isOpen: true, closeCartDrawer: vi.fn() }),
}))

vi.mock('../../../contexts/CartContext.jsx', () => ({
  useCart: () => ({
    items: [
      { id: 1, product_id: 232, product_name: 'DMC mouliné N° 3045', quantity: 3, unit_price: 1.5, compare_unit_price: 2 },
      { id: 2, product_id: 1493, product_name: 'Graziano, tissu', quantity: 1, unit_price: 10, compare_unit_price: null },
    ],
    itemCount: 2, subtotal: 14.5, updateQty: vi.fn(), removeItem: vi.fn(),
  }),
}))

describe('CartDrawer — articles en action (CLI-14)', () => {
  test('mention « En action » et prix normal barré pour l\'article en action seulement', () => {
    render(<MemoryRouter><CartDrawer /></MemoryRouter>)

    expect(screen.getAllByText('En action -25 %')).toHaveLength(1)
    // 3 × 2.00 barré, à côté de 3 × 1.50 payé
    const old = screen.getByText('CHF 6.00')
    expect(old.tagName).toBe('SPAN')
    expect(old.className).toMatch(/itemTotalOld/)
    expect(screen.getByText(/CHF 4.50/)).toBeInTheDocument()
    // L'article hors action n'a ni mention ni prix barré
    expect(screen.getByText('CHF 10.00')).toBeInTheDocument()
  })
})
