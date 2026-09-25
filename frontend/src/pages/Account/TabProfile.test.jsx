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
  getNewsletterPreference: vi.fn().mockResolvedValue({ data: { status: 'none' } }),
  setNewsletterPreference: vi.fn(),
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
/* Répertoire officiel des NPA (API) simulé : 1510 dessert Moudon et Syens */
vi.mock('../../services/shipping.service.js', () => ({
  getLocalities: vi.fn(async (zip) => (zip === '1510'
    ? [{ city: 'Moudon', canton: 'VD' }, { city: 'Syens', canton: 'VD' }]
    : null)),
  isSwissZip: vi.fn(async (zip) => zip === '1510'),
}))
vi.mock('../../services/loyalty.service.js', () => ({
  getLoyaltyAccount: vi.fn().mockResolvedValue({ data: null }),
  getLoyaltyRewards: vi.fn().mockResolvedValue({ data: [] }),
  getLoyaltyTiers:   vi.fn().mockResolvedValue({ data: [] }),
}))

import { TabProfile } from './ProfilePage.jsx'
import { createAddress, getAddresses } from '../../services/addresses.service.js'

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

describe('TabProfile — erreurs du serveur (CLI-06)', () => {
  test('affiche sous le champ l\'erreur de validation renvoyée par le serveur', async () => {
    const user = userEvent.setup()
    updateProfileMock.mockRejectedValueOnce({
      response: { data: { message: 'Données invalides.', errors: [{ field: 'last_name', message: 'Le nom ne peut pas dépasser 100 caractères.' }] } },
    })
    render(<TabProfile user={JULIE} />)

    await screen.findByLabelText('Prénom')
    await user.click(screen.getByRole('button', { name: /account.saveChanges/ }))

    expect(await screen.findByText('Le nom ne peut pas dépasser 100 caractères.')).toBeInTheDocument()
  })
})

/* Une adresse refusée par le serveur s'affichait comme enregistrée : la fenêtre
   se fermait sans attendre la réponse et l'erreur était avalée. */
describe('Adresses du compte (CLI-06)', () => {
  const fillAddress = async (user) => {
    await user.type(screen.getByLabelText(/Libellé/), 'Maison')
    await user.type(screen.getByLabelText(/Rue/), 'Rue du Bourg')
    await user.type(screen.getByLabelText(/Numéro/), '12')
    await user.type(screen.getByLabelText(/^NPA \*$/), '1510')
    // Libellé exact : « Localités de ce NPA » (choix proposés pour le 1510) ne doit pas répondre
    await user.type(screen.getByLabelText(/^Localité \*$/), 'Moudon')
    await user.selectOptions(screen.getByLabelText(/Canton/), 'VD')
    await user.type(screen.getByLabelText(/Téléphone/), '079 123 45 67')
  }

  beforeEach(() => {
    getAddresses.mockResolvedValue({ data: [] })
    createAddress.mockReset()
  })

  test('garde la fenêtre ouverte et affiche l\'erreur si le serveur refuse', async () => {
    const user = userEvent.setup()
    createAddress.mockRejectedValueOnce({ response: { data: { message: 'Adresse invalide.' } } })
    render(<TabProfile user={JULIE} />)

    await user.click(await screen.findByRole('button', { name: /Ajouter une adresse/ }))
    await fillAddress(user)
    await user.click(screen.getByRole('button', { name: 'account.save' }))

    expect(await screen.findByText('Adresse invalide.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('enregistre le téléphone et l\'affiche dans la liste', async () => {
    const user = userEvent.setup()
    createAddress.mockImplementation(async (data) => ({ data: { id: 1, is_default: 0, ...data } }))
    render(<TabProfile user={JULIE} />)

    await user.click(await screen.findByRole('button', { name: /Ajouter une adresse/ }))
    await fillAddress(user)
    await user.click(screen.getByRole('button', { name: 'account.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(createAddress.mock.calls[0][0]).toMatchObject({ phone: '079 123 45 67' })
    expect(screen.getByText(/Tél\. 079 123 45 67/)).toBeInTheDocument()
  })

  test('enregistre le complément d\'adresse et l\'affiche avant la rue', async () => {
    const user = userEvent.setup()
    createAddress.mockImplementation(async (data) => ({ data: { id: 1, is_default: 0, ...data } }))
    render(<TabProfile user={JULIE} />)

    await user.click(await screen.findByRole('button', { name: /Ajouter une adresse/ }))
    await fillAddress(user)
    await user.type(screen.getByLabelText(/Complément/), 'c/o Famille Rochat')
    await user.click(screen.getByRole('button', { name: 'account.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(createAddress.mock.calls[0][0]).toMatchObject({ complement: 'c/o Famille Rochat' })
    expect(screen.getByText(/c\/o Famille Rochat, Rue du Bourg 12, 1510 Moudon/)).toBeInTheDocument()
  })

  test('refuse un NPA hors de Suisse : livraison en Suisse uniquement', async () => {
    const user = userEvent.setup()
    render(<TabProfile user={JULIE} />)

    await user.click(await screen.findByRole('button', { name: /Ajouter une adresse/ }))
    await fillAddress(user)
    await user.clear(screen.getByLabelText(/^NPA \*$/))
    await user.type(screen.getByLabelText(/^NPA \*$/), '9490')
    await user.click(screen.getByRole('button', { name: 'account.save' }))

    expect(await screen.findByText('account.val.zipUnknown')).toBeInTheDocument()
    expect(createAddress).not.toHaveBeenCalled()
  })
})
