import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthField from './AuthField.jsx'

const t = (k) => k // i18n stub

describe('AuthField', () => {
  test('rend un input relié à son label', () => {
    render(<AuthField id="email" label="Email" name="email" t={t} />)
    const input = screen.getByLabelText('Email')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('id', 'email')
  })

  test('sans erreur : pas d’aria-invalid ni de message', () => {
    render(<AuthField id="email" label="Email" name="email" t={t} />)
    const input = screen.getByLabelText('Email')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('avec erreur : aria-invalid, message role=alert et aria-describedby', () => {
    render(
      <AuthField id="email" label="Email" name="email" t={t}
        error={{ message: 'Format invalide' }} />
    )
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'email-error')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Format invalide')
    expect(alert).toHaveAttribute('id', 'email-error')
  })

  test('champ requis : astérisque visuel + libellé lecteur d’écran', () => {
    render(<AuthField id="pwd" label="Mot de passe" name="password" required t={t} />)
    expect(screen.getByText('form.requiredField', { exact: false })).toBeInTheDocument()
  })
})
