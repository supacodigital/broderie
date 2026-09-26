import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import TextStyleEditor from './TextStyleEditor.jsx'

const FONTS = [
  { key: 'montserrat', label: 'Montserrat', family: 'Montserrat', fallback: 'sans-serif', category: 'sans', weights: [300, 400, 500, 600], italic: false },
  { key: 'lora', label: 'Lora', family: 'Lora', fallback: 'serif', category: 'serif', weights: [400, 500, 600, 700], italic: true },
  { key: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', fallback: 'cursive', category: 'script', weights: [400], italic: false },
]
// Sous-titre du bandeau principal : Cormorant italique sur rose pâle
const LOOK = {
  fontKey: 'montserrat', family: "'Montserrat', sans-serif", weight: 400, size: 28, color: '#831843',
  align: 'left', italic: true, uppercase: false, underline: false, lineHeight: 1.4, letterSpacing: 0,
}

/* Éditeur contrôlé, comme dans la page : l'état remonte à chaque réglage */
function Harness({ initial, onChangeSpy, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <TextStyleEditor
      value={value}
      onChange={v => { onChangeSpy?.(v); setValue(v) }}
      look={LOOK} bg="#fdeef7" fonts={FONTS} sample="Kits et fils sélectionnés" {...props}
    />
  )
}

const open = async (user) => user.click(screen.getByRole('button', { name: /Mise en forme/ }))

describe('TextStyleEditor', () => {
  it('replié par défaut ; indique « Apparence du site » tant que rien n\'est réglé', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /Mise en forme/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Apparence du site')).toBeInTheDocument()
  })

  it('police et graisse : seules les graisses de la police choisie sont proposées', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} />)
    await open(user)

    await user.selectOptions(screen.getByLabelText('Police'), 'lora')
    expect(spy).toHaveBeenLastCalledWith({ font: 'lora' })
    const weightOptions = [...screen.getByLabelText('Graisse').querySelectorAll('option')].map(o => o.value)
    expect(weightOptions).toEqual(['', '400', '500', '600', '700'])

    await user.selectOptions(screen.getByLabelText('Graisse'), '700')
    expect(spy).toHaveBeenLastCalledWith({ font: 'lora', weight: 700 })

    // Great Vibes n'existe qu'en 400 : la graisse suit
    await user.selectOptions(screen.getByLabelText('Police'), 'great-vibes')
    expect(spy).toHaveBeenLastCalledWith({ font: 'great-vibes', weight: 400 })
  })

  it('désactiver un effet prévu par le site (italique) le retire ; le réactiver ne laisse aucune trace', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} />)
    await open(user)

    const italic = screen.getByRole('button', { name: 'Italique' })
    expect(italic).toHaveAttribute('aria-pressed', 'true')
    await user.click(italic)
    expect(spy).toHaveBeenLastCalledWith({ italic: false })
    await user.click(italic)
    expect(spy).toHaveBeenLastCalledWith(undefined)
  })

  it('taille : virgule acceptée, valeur ramenée dans les bornes en quittant le champ', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} />)
    await open(user)

    const size = screen.getByLabelText('Taille (grand écran)')
    await user.type(size, '400')
    await user.tab()
    expect(size).toHaveValue('120')
    expect(spy).toHaveBeenLastCalledWith({ size: 120 })
    expect(screen.getByText(/réduit progressivement jusqu’à 72 px sur Natel/)).toBeInTheDocument()

    const spacing = screen.getByLabelText('Espacement des lettres')
    await user.type(spacing, '0,05')
    await user.tab()
    expect(spy).toHaveBeenLastCalledWith({ size: 120, letterSpacing: 0.05 })
  })

  it('couleur peu lisible sur le fond du bloc : avertissement de contraste', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await open(user)
    expect(screen.queryByText(/Contraste insuffisant/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Blanc' }))
    expect(screen.getByText(/Contraste insuffisant/)).toBeInTheDocument()
  })

  it('aperçu : le texte avec la mise en forme effective', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ font: 'lora', weight: 700, size: 40, align: 'center' }} />)
    await open(user)
    const preview = screen.getByText('Kits et fils sélectionnés')
    expect(preview.style.fontFamily).toBe('"Lora", serif')
    expect(preview.style.fontWeight).toBe('700')
    expect(preview.style.fontSize).toBe('40px')
    expect(preview.style.textAlign).toBe('center')
    expect(preview.style.fontStyle).toBe('italic') // hérité de l'apparence d'origine
  })

  it('« Revenir à l\'apparence du site » efface tous les réglages', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness initial={{ font: 'lora', size: 40 }} onChangeSpy={spy} />)
    expect(screen.getByText('Personnalisée')).toBeInTheDocument()
    await open(user)
    await user.click(screen.getByRole('button', { name: /Revenir à l’apparence du site/ }))
    expect(spy).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByText('Apparence du site')).toBeInTheDocument()
  })

  it('bouton : ni alignement ni interligne', async () => {
    const user = userEvent.setup()
    render(<Harness kind="button" />)
    await open(user)
    expect(screen.queryByRole('group', { name: 'Alignement' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Interligne')).not.toBeInTheDocument()
  })

  it('erreur du serveur sur ce texte : panneau ouvert, message affiché', () => {
    render(<Harness error="Graisse non disponible pour cette police." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Graisse non disponible pour cette police.')
  })
})
