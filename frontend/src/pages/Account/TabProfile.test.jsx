import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* Non-régression CLI-06 — « Impossible de modifier les informations personnelles
   du compte client ».

   La session se restaure par un appel réseau : au premier rendu, le contexte
   d'authentification ne connaît pas encore l'utilisateur. React Hook Form ne lit
   ses `defaultValues` qu'une seule fois, le formulaire restait donc vide, et le
   bouton — désactivé tant que rien n'était « modifié » — laissait la page en
   lecture seule apparente. */

const updateProfileMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('../../services/profile.service.js', () => ({
  updateProfile: (...args) => updateProfileMock(...args),
  updatePassword: vi.fn(),
  downloadMyData: vi.fn(),
  deleteMyAccount: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, ...rest }) => <a {...rest}>{children}</a>,
}))

/* Les sous-sections du panneau (adresses, fidélité, confidentialité) lisent le
   contexte d'authentification ; elles ne sont pas l'objet de ces tests. */
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, logout: vi.fn(), refreshUser: vi.fn() }),
}))

// Sous-sections non concernées par ce formulaire
vi.mock('../../services/addresses.service.js', () => ({
  getAddresses: vi.fn().mockResolvedValue({ data: [] }),
  createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn(),
}))
vi.mock('../../services/loyalty.service.js', () => ({
  getLoyaltyAccount: vi.fn().mockResolvedValue({ data: null }),
  getLoyaltyRewards: vi.fn().mockResolvedValue({ data: [] }),
  getLoyaltyTiers:   vi.fn().mockResolvedValue({ data: [] }),
}))

import { TabProfile } from './Account.jsx'

const JULIE = { firstName: 'Julie', lastName: 'Guerle', email: 'julie@broderie.ch' }

describe('TabProfile — modification des informations (CLI-06)', () => {
  beforeEach(() => updateProfileMock.mockClear())

  test('affiche les informations quand le compte est déjà chargé', async () => {
    render(<TabProfile user={JULIE} />)

    expect(await screen.findByLabelText('Prénom')).toHaveValue('Julie')
    expect(screen.getByLabelText('Nom')).toHaveValue('Guerle')
  })

  /* Le cas réel : la page monte AVANT que la session soit restaurée. */
  test('remplit le formulaire quand le compte arrive après le premier rendu', async () => {
    const { rerender } = render(<TabProfile user={null} />)

    expect(screen.getByLabelText('Prénom')).toHaveValue('')

    rerender(<TabProfile user={JULIE} />)

    await waitFor(() => expect(screen.getByLabelText('Prénom')).toHaveValue('Julie'))
    expect(screen.getByLabelText('Nom')).toHaveValue('Guerle')
  })

  test('le bouton reste utilisable une fois le compte chargé', async () => {
    const { rerender } = render(<TabProfile user={null} />)

    // Tant que le compte n'est pas connu, enregistrer n'aurait aucun sens
    expect(screen.getByRole('button', { name: /account.saveChanges/ })).toBeDisabled()

    rerender(<TabProfile user={JULIE} />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /account.saveChanges/ })).toBeEnabled()
    )
  })

  test('enregistre une modification du prénom', async () => {
    const user = userEvent.setup()
    render(<TabProfile user={JULIE} />)

    const input = await screen.findByLabelText('Prénom')
    await user.clear(input)
    await user.type(input, 'Juliette')
    await user.click(screen.getByRole('button', { name: /account.saveChanges/ }))

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1))
    expect(updateProfileMock.mock.calls[0][0]).toMatchObject({
      first_name: 'Juliette',
      last_name: 'Guerle',
    })
  })

  /* Si la cliente commence à taper pendant le chargement, sa saisie doit survivre
     à l'arrivée du compte — sinon on remplace la perte d'un bug par celle d'un autre. */
  test('conserve la saisie en cours quand le compte arrive', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabProfile user={null} />)

    await user.type(screen.getByLabelText('Prénom'), 'Juliette')
    rerender(<TabProfile user={JULIE} />)

    await waitFor(() => expect(screen.getByLabelText('Nom')).toHaveValue('Guerle'))
    expect(screen.getByLabelText('Prénom')).toHaveValue('Juliette')
  })
})
