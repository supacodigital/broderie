import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* Non-régression CLI-01 — « depuis un natel le champ de recherche est inopérant ».
   Les deux champs (barre desktop et tiroir mobile) coexistent dans le DOM, seul le
   CSS en masque un. Ces tests portent sur le tiroir mobile, celui que la cliente
   utilise depuis son téléphone. */

const navigateMock = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

const fetchSuggestionsMock = vi.fn()
let suggestionsValue = []

/* Le hook réel appelle l'API ; on le remplace par un état local qui en reproduit
   le contrat. `clearSearch` doit être stable (useCallback sans dépendances dans le
   vrai hook) : une référence changeant à chaque rendu relancerait l'effet de focus,
   qui vide le champ — exactement la perte de saisie décrite par le ticket. */
vi.mock('../../../hooks/useProductSearch.js', async () => {
  const { useState, useCallback } = await import('react')
  return {
    useProductSearch: () => {
      const [value, setValue] = useState('')
      const clearSearch = useCallback(() => setValue(''), [])
      return {
        value,
        setValue,
        suggestions: suggestionsValue,
        setSuggestions: vi.fn(),
        activeIndex: -1,
        setActiveIndex: vi.fn(),
        loading: false,
        fetchSuggestions: fetchSuggestionsMock,
        handleKeyDown: vi.fn(),
        clearSearch,
      }
    },
  }
})

vi.mock('../../ui/SearchSuggestion/SearchSuggestion.jsx', () => ({
  default: ({ product }) => <span>{product.name}</span>,
}))

import NavSearch from './NavSearch.jsx'

// Le tiroir mobile est le second champ rendu ; le premier est celui de la barre desktop.
const getDrawerInput = () => screen.getAllByPlaceholderText('catalogue.searchPlaceholder')[1]

describe('NavSearch — recherche mobile (CLI-01)', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    fetchSuggestionsMock.mockClear()
    suggestionsValue = []
  })

  test('la saisie est conservée dans le champ du tiroir', async () => {
    const user = userEvent.setup()
    render(<NavSearch open onClose={vi.fn()} />)

    const input = getDrawerInput()
    await user.type(input, 'moulinés')

    // Le grief du ticket : « perte de la saisie utilisateur »
    expect(input).toHaveValue('moulinés')
  })

  /* La touche « Rechercher » du clavier tactile soumet le formulaire sans émettre
     d'événement clavier exploitable : sans <form>, l'appui ne faisait rien. */
  test('valider depuis le clavier tactile lance la recherche', async () => {
    const user = userEvent.setup()
    render(<NavSearch open onClose={vi.fn()} />)

    const input = getDrawerInput()
    await user.type(input, 'aida{Enter}')

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1))
    expect(navigateMock).toHaveBeenCalledWith('/catalogue?q=aida')
  })

  test('un terme trop court ne déclenche aucune navigation', async () => {
    const user = userEvent.setup()
    render(<NavSearch open onClose={vi.fn()} />)

    await user.type(getDrawerInput(), 'a{Enter}')

    expect(navigateMock).not.toHaveBeenCalled()
  })

  /* Au tactile, `mousedown` n'est pas émis de façon fiable : un appui sur une
     suggestion restait sans effet. Les résultats répondent donc à `click`.

     ⚠️ jsdom simule un `click` par `mousedown` + `mouseup`, donc les deux
     implémentations y répondent de la même façon : déclencher l'événement ne
     prouverait rien. On vérifie donc que la suggestion réagit bien à un `click`
     SEUL, sans `mousedown` préalable — ce qu'un gestionnaire `onMouseDown` ne
     ferait pas, et qui correspond à ce que produit un appui tactile. */
  test('appuyer sur une suggestion ouvre le catalogue sur ce terme', async () => {
    suggestionsValue = [{ id: 1, name: 'Coton mouliné DMC 310' }]
    render(<NavSearch open onClose={vi.fn()} />)

    const options = screen.getAllByRole('option', { name: /Coton mouliné DMC 310/ })
    const mobileOption = options[options.length - 1]

    // Un click seul, sans mousedown : c'est ce que reçoit la page au tactile
    fireEvent.click(mobileOption)

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1))
    expect(navigateMock).toHaveBeenCalledWith('/catalogue?q=Coton%20moulin%C3%A9%20DMC%20310')
  })

  /* Le clavier tactile soumet un formulaire ; sans <form>, la touche « Rechercher »
     n'avait aucun effet. On vérifie la structure, que jsdom ne peut pas simuler. */
  test('le champ mobile est dans un formulaire soumettable', () => {
    render(<NavSearch open onClose={vi.fn()} />)
    const form = getDrawerInput().closest('form')

    expect(form).not.toBeNull()
    // Les boutons du formulaire ne doivent pas le soumettre par défaut
    form.querySelectorAll('button').forEach((btn) => {
      expect(btn).toHaveAttribute('type', 'button')
    })
  })

  test('le champ du tiroir évite la correction automatique du clavier', () => {
    render(<NavSearch open onClose={vi.fn()} />)
    const input = getDrawerInput()

    // « moulinés » corrigé en « moulines » ne ramènerait pas les mêmes résultats
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('enterkeyhint', 'search')
  })
})
