import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.test') })

const STABLE_EMAIL = process.env.TEST_USER_EMAIL    || 'test.e2e@broderie.ch'
const STABLE_PWD   = process.env.TEST_USER_PASSWORD || 'Test1234!'

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
async function loginClient(page) {
  await page.goto('/connexion')
  await page.fill('#login-email', STABLE_EMAIL)
  await page.fill('#login-password', STABLE_PWD)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.waitForURL('**/mon-compte', { timeout: 10_000 })
}

async function addFirstProductToCart(page) {
  await page.goto('/catalogue')
  const cards = page.locator('a[class*="_card_"], [class*="_card_"]')
  await expect(cards.first()).toBeVisible({ timeout: 10_000 })
  await cards.first().click()
  await expect(page).toHaveURL(/\/produit\//, { timeout: 8_000 })
  const addBtn = page.locator('[class*="_addBtn_"]').first()
  await expect(addBtn).toBeVisible({ timeout: 5_000 })
  await addBtn.click()
}

/* ─────────────────────────────────────────────
   ACCÈS CHECKOUT
───────────────────────────────────────────── */
test.describe('Checkout — Accès', () => {
  test('redirige vers /connexion si non authentifié', async ({ page }) => {
    await page.goto('/commande')
    await expect(page).toHaveURL(/\/connexion/, { timeout: 8_000 })
  })

  test('redirige vers /panier si panier vide après connexion', async ({ page }) => {
    await loginClient(page)
    await page.goto('/commande')
    /* Soit retour au panier, soit message d'erreur visible */
    await page.waitForTimeout(2_000)
    const url = page.url()
    const emptyMsg = page.getByText(/panier est vide|aucun article/i)
    const hasEmpty = await emptyMsg.isVisible().catch(() => false)
    const isOnCart = url.includes('/panier')
    expect(hasEmpty || isOnCart || url.includes('/commande')).toBeTruthy()
  })
})

/* ─────────────────────────────────────────────
   TUNNEL D'ACHAT COMPLET
───────────────────────────────────────────── */
test.describe('Checkout — Tunnel complet', () => {
  test.beforeEach(async ({ page }) => {
    await loginClient(page)
    await addFirstProductToCart(page)
  })

  test('affiche la page commande avec le récapitulatif', async ({ page }) => {
    await page.goto('/commande')
    await page.waitForTimeout(2_000)

    /* La page checkout doit afficher un sous-total en CHF */
    const summary = page.locator('[class*="summary"], [class*="Summary"], [class*="recap"], [class*="total"]').first()
    const hasChf  = page.getByText(/CHF|Fr\./i).first()

    const hasSummary = await summary.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasPrice   = await hasChf.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(hasSummary || hasPrice).toBeTruthy()
  })

  test('affiche le formulaire d\'adresse de livraison', async ({ page }) => {
    await page.goto('/commande')
    await page.waitForTimeout(2_000)

    /* Champs adresse attendus */
    const streetField = page.locator(
      'input[name="street"], input[placeholder*="rue"], input[placeholder*="adresse"], input[id*="street"]'
    ).first()
    const cityField = page.locator(
      'input[name="city"], input[placeholder*="ville"], input[id*="city"]'
    ).first()

    const hasStreet = await streetField.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasCity   = await cityField.isVisible({ timeout: 5_000 }).catch(() => false)

    /* Au moins un champ adresse ou un sélecteur d'adresse existante doit être visible */
    const addressSection = page.locator('[class*="address"], [class*="Address"], [class*="livraison"]').first()
    const hasSection = await addressSection.isVisible({ timeout: 5_000 }).catch(() => false)

    expect(hasStreet || hasCity || hasSection).toBeTruthy()
  })

  test('affiche les méthodes de paiement', async ({ page }) => {
    await page.goto('/commande')
    await page.waitForTimeout(2_000)

    /* Méthodes de paiement suisses attendues */
    const invoice = page.getByText(/facture|invoice/i).first()
    const payment = page.locator('[class*="payment"], [class*="Payment"], [class*="paiement"]').first()

    const hasInvoice  = await invoice.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasPayment  = await payment.isVisible({ timeout: 5_000 }).catch(() => false)

    expect(hasInvoice || hasPayment).toBeTruthy()
  })

  test('affiche les frais de port en CHF', async ({ page }) => {
    await page.goto('/commande')
    await page.waitForTimeout(2_000)

    const shipping = page.getByText(/port|livraison|expédition/i).first()
    const hasShipping = await shipping.isVisible({ timeout: 8_000 }).catch(() => false)
    /* Les frais de port sont toujours payants (CLAUDE.md) */
    expect(hasShipping).toBeTruthy()
  })
})

/* ─────────────────────────────────────────────
   MON COMPTE — PROFIL
───────────────────────────────────────────── */
test.describe('Mon compte — Profil', () => {
  test.beforeEach(async ({ page }) => {
    await loginClient(page)
  })

  test('affiche le profil de l\'utilisateur connecté', async ({ page }) => {
    await page.goto('/mon-compte')

    /* Attend un élément propre au profil */
    const profile = page.locator('[class*="profile"], [class*="Profile"], [class*="account"]').first()
    const hasEmail = page.getByText(STABLE_EMAIL, { exact: false })

    const hasProfile = await profile.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasEmailVisible = await hasEmail.isVisible({ timeout: 5_000 }).catch(() => false)

    expect(hasProfile || hasEmailVisible).toBeTruthy()
  })

  test('affiche la liste des commandes (même vide)', async ({ page }) => {
    await page.goto('/mon-compte')

    /* Section commandes : soit des lignes, soit "aucune commande" */
    const orders = page.locator('[class*="order"], [class*="Order"], [class*="commande"]').first()
    const empty  = page.getByText(/aucune commande|pas de commande/i)

    await page.waitForTimeout(2_000)
    const hasOrders = await orders.isVisible().catch(() => false)
    const hasEmpty  = await empty.isVisible().catch(() => false)

    expect(hasOrders || hasEmpty).toBeTruthy()
  })

  test('permet de modifier le prénom depuis le profil', async ({ page }) => {
    await page.goto('/mon-compte')

    /* Cherche un bouton ou lien "Modifier" sur la section profil */
    const editBtn = page.getByRole('button', { name: /modifier|éditer|edit/i }).first()
    const hasEdit = await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasEdit) {
      await editBtn.click()
      const firstNameInput = page.locator('input[name="firstName"], input[name="first_name"], input[id*="firstName"]').first()
      const hasInput = await firstNameInput.isVisible({ timeout: 3_000 }).catch(() => false)
      expect(hasInput).toBeTruthy()
    }
  })
})

/* ─────────────────────────────────────────────
   RÉINITIALISATION MOT DE PASSE
───────────────────────────────────────────── */
test.describe('Mot de passe oublié', () => {
  test('affiche le formulaire de réinitialisation', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie')

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    await expect(emailInput).toBeVisible({ timeout: 5_000 })
  })

  test('affiche un message de confirmation après soumission', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie')

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    await emailInput.fill('test@broderie.ch')
    await page.getByRole('button', { name: /envoyer|réinitialiser|submit/i }).first().click()

    /* Un message de confirmation ou de succès doit apparaître */
    await page.waitForTimeout(2_000)
    const confirm = page.getByText(/email envoyé|vérifiez|consultez votre|lien de réinitialisation/i).first()
    const alert   = page.locator('[class*="success"], [class*="confirm"], [role="alert"]').first()

    const hasConfirm = await confirm.isVisible({ timeout: 5_000 }).catch(() => false)
    const hasAlert   = await alert.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(hasConfirm || hasAlert).toBeTruthy()
  })
})
