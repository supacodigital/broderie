import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/* Onglets choisis depuis le menu latéral (26.09) : la page n'a plus sa propre
   colonne d'onglets, affiche l'onglet ouvert dans son titre et signale une
   saisie en cours au garde-fou commun, que le menu consulte. */
vi.mock('../../services/settings.service.js', () => ({
  getStoreSettings: vi.fn().mockResolvedValue({ store_name: 'Au Point-Compté' }),
  updateStoreSettings: vi.fn(),
  getTaxRates: vi.fn().mockResolvedValue([]),
  updateTaxRates: vi.fn(),
  getShippingRates: vi.fn().mockResolvedValue([]),
  updateShippingRates: vi.fn(),
  getPickupSettings: vi.fn().mockResolvedValue({}),
  updatePickupSettings: vi.fn(),
  getInvoiceSettings: vi.fn().mockResolvedValue({}),
  updateInvoiceSettings: vi.fn(),
}))
vi.mock('./SecurityTab.jsx', () => ({ default: () => <p>Onglet sécurité</p> }))

import Settings from './Settings.jsx'
import { UnsavedChangesProvider, useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx'

function DirtyProbe() {
  const { dirty } = useUnsavedChanges()
  return <p>garde-fou : {dirty ? 'actif' : 'inactif'}</p>
}

const renderAt = (path, { withSettings = true } = {}) => (
  <UnsavedChangesProvider>
    <MemoryRouter initialEntries={[path]}>
      {withSettings && <Settings />}
      <DirtyProbe />
    </MemoryRouter>
  </UnsavedChangesProvider>
)

beforeEach(() => {
  window.scrollTo = vi.fn()
})

describe('Paramètres — onglet choisi dans le menu', () => {
  it('le titre et la description indiquent l\'onglet ouvert', async () => {
    render(renderAt('/parametres?onglet=security'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Paramètres · Sécurité')
    expect(screen.getByText('Double authentification')).toBeInTheDocument()
    expect(await screen.findByText('Onglet sécurité')).toBeInTheDocument()
  })

  it('onglet inconnu ou absent : Boutique', async () => {
    render(renderAt('/parametres?onglet=inexistant'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Paramètres · Boutique')
    expect(await screen.findByDisplayValue('Au Point-Compté')).toBeInTheDocument()
  })

  it('plus de colonne d\'onglets dans la page', async () => {
    render(renderAt('/parametres'))
    await screen.findByDisplayValue('Au Point-Compté')
    expect(screen.queryByRole('button', { name: /TVA/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Livraison/ })).not.toBeInTheDocument()
  })

  it('une saisie non enregistrée active le garde-fou commun, relâché en quittant la page', async () => {
    const user = userEvent.setup()
    const { rerender } = render(renderAt('/parametres'))
    const name = await screen.findByDisplayValue('Au Point-Compté')
    expect(screen.getByText('garde-fou : inactif')).toBeInTheDocument()

    await user.type(name, ' SA')
    expect(screen.getByText('garde-fou : actif')).toBeInTheDocument()

    // Revenir à la valeur d'origine n'est pas une modification
    await user.clear(name)
    await user.type(name, 'Au Point-Compté')
    expect(screen.getByText('garde-fou : inactif')).toBeInTheDocument()

    await user.type(name, ' SA')
    rerender(renderAt('/parametres', { withSettings: false }))
    expect(screen.getByText('garde-fou : inactif')).toBeInTheDocument()
  })
})
