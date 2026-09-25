import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

/* Audit du 25.09 — retour d'un QR Twint payé depuis l'e-mail. La cliente
   arrivait sur « Connexion », puis lisait « Réglez votre facture sous 30 jours ».
   Service remplacé par une fonction ordinaire (voir NewsletterConfirm.test.jsx :
   Vitest 4 signale le rejet d'un vi.fn() même intercepté). */
let calls = []
let confirmImpl = async () => ({})
vi.mock('../../services/payments.service.js', () => ({
  confirmTwintQrReturn: (...args) => { calls.push(args); return confirmImpl(...args) },
}))

import TwintPayment from './TwintPayment.jsx'

// Relève l'adresse affichée, après chaque rendu (jamais pendant)
let currentUrl = ''
function LocationProbe() {
  const location = useLocation()
  useEffect(() => { currentUrl = location.pathname + location.search }, [location])
  return null
}

const RETURN_URL = '/paiement-twint?payment_intent=pi_3Abc&payment_intent_client_secret=pi_3Abc_secret_Xyz&redirect_status=succeeded'

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/paiement-twint" element={<><TwintPayment /><LocationProbe /></>} /></Routes>
  </MemoryRouter>
)

const httpError = (status, message) => {
  const err = new Error(String(status))
  err.response = { status, data: { message } }
  return err
}

describe('TwintPayment — retour d\'un QR Twint payé depuis l\'e-mail', () => {
  beforeEach(() => { calls = [] })

  test('paiement reçu : confirmation, plus rien à régler, sans connexion', async () => {
    confirmImpl = async () => ({ orderId: 93, paymentStatus: 'paid' })
    renderAt(RETURN_URL)

    expect(await screen.findByText('Paiement reçu, merci !')).toBeInTheDocument()
    expect(screen.getByText(/commande n° 93 a bien été reçu/)).toBeInTheDocument()
    expect(screen.getByText(/plus rien à régler/)).toBeInTheDocument()
    expect(calls).toEqual([['pi_3Abc', 'pi_3Abc_secret_Xyz']])
  })

  test('le secret du paiement est retiré de l\'adresse', async () => {
    confirmImpl = async () => ({ orderId: 93, paymentStatus: 'paid' })
    renderAt(RETURN_URL)

    await screen.findByText('Paiement reçu, merci !')
    await waitFor(() => expect(currentUrl).toBe('/paiement-twint'))
  })

  test('paiement refusé ou code remplacé : rien n\'a été débité, contact proposé', async () => {
    confirmImpl = async () => ({ orderId: 93, paymentStatus: 'failed' })
    renderAt(RETURN_URL)

    expect(await screen.findByText('Le paiement n\'a pas abouti')).toBeInTheDocument()
    expect(screen.getByText(/Aucun montant n'a été débité/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'contact@broderie.ch' })).toHaveAttribute('href', 'mailto:contact@broderie.ch')
  })

  test('paiement encore en validation chez Twint', async () => {
    confirmImpl = async () => ({ orderId: 93, paymentStatus: 'processing' })
    renderAt(RETURN_URL)

    expect(await screen.findByText('Paiement en cours de validation')).toBeInTheDocument()
    expect(screen.getByText(/se met à jour toute seule/)).toBeInTheDocument()
  })

  test('lien incomplet : aucun appel au serveur', () => {
    renderAt('/paiement-twint?payment_intent=pi_3Abc')

    expect(screen.getByText('Ce lien de paiement n\'est pas reconnu')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  test('lien refusé par le serveur (404) : non reconnu, sans bouton « Réessayer »', async () => {
    confirmImpl = async () => { throw httpError(404, 'Paiement introuvable.') }
    renderAt(RETURN_URL)

    expect(await screen.findByText('Ce lien de paiement n\'est pas reconnu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })

  test('Stripe injoignable : message du serveur, et « Réessayer » relance la vérification', async () => {
    confirmImpl = async () => { throw httpError(503, 'Impossible de vérifier le paiement pour le moment. Réessayez dans un instant.') }
    renderAt(RETURN_URL)

    expect(await screen.findByText('Vérification impossible pour le moment')).toBeInTheDocument()
    expect(screen.getByText(/Impossible de vérifier le paiement/)).toBeInTheDocument()

    confirmImpl = async () => ({ orderId: 93, paymentStatus: 'paid' })
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText('Paiement reçu, merci !')).toBeInTheDocument()
    expect(calls).toHaveLength(2)
  })
})
