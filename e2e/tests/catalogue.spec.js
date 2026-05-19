import { test, expect } from '@playwright/test'

/* ─────────────────────────────────────────────
   PAGE CATALOGUE
───────────────────────────────────────────── */
test.describe('Catalogue', () => {
  test('affiche des produits sur la page catalogue', async ({ page }) => {
    await page.goto('/catalogue')

    /* Attend la fin du chargement — au moins une carte produit visible */
    const cards = page.locator('a[class*="_card_"], [class*="_card_"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })

    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('affiche un état vide si la recherche ne donne aucun résultat', async ({ page }) => {
    await page.goto('/catalogue?q=xyzimpossible999')

    /* Attend que le skeleton disparaisse */
    await page.waitForTimeout(2_000)

    const emptyState = page.locator('[class*="_wrap_"]').first()
    await expect(emptyState).toBeVisible({ timeout: 8_000 })
  })

  test('la pagination change les produits affichés', async ({ page }) => {
    await page.goto('/catalogue')

    /* Attend le chargement de la première page */
    const cards = page.locator('a[class*="_card_"], [class*="_card_"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })

    /* Récupère le texte du premier produit page 1 */
    const firstProductText = await cards.first().textContent()

    /* Clique sur "page 2" si elle existe */
    const page2Btn = page.getByRole('button', { name: '2' })
    const hasPage2 = await page2Btn.isVisible().catch(() => false)

    if (hasPage2) {
      await page2Btn.click()
      await page.waitForTimeout(1_500)

      const firstProductPage2 = await cards.first().textContent()
      expect(firstProductPage2).not.toBe(firstProductText)
    }
  })
})

/* ─────────────────────────────────────────────
   FICHE PRODUIT
───────────────────────────────────────────── */
test.describe('Fiche produit', () => {
  test('ouvre une fiche produit depuis le catalogue', async ({ page }) => {
    await page.goto('/catalogue')

    const cards = page.locator('a[class*="_card_"], [class*="_card_"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })

    /* Clique sur le premier produit */
    await cards.first().click()

    /* Vérifie qu'on est sur une URL /produit/... */
    await expect(page).toHaveURL(/\/produit\//, { timeout: 8_000 })

    /* Vérifie que le bouton "Ajouter au panier" est présent sur la fiche produit */
    const addBtn = page.locator('[class*="_addBtn_"]').first()
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
  })

  test('affiche le prix en CHF', async ({ page }) => {
    await page.goto('/catalogue')
    const cards = page.locator('a[class*="_card_"], [class*="_card_"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    await cards.first().click()
    await expect(page).toHaveURL(/\/produit\//, { timeout: 8_000 })

    /* Le prix doit contenir CHF ou Fr. */
    const price = page.locator('[class*="price"], [class*="Price"]').first()
    await expect(price).toBeVisible({ timeout: 5_000 })
    const priceText = await price.textContent()
    expect(priceText).toMatch(/CHF|Fr\./)
  })

  test('affiche une page 404 pour un slug inexistant', async ({ page }) => {
    await page.goto('/produit/produit-qui-nexiste-pas-xyz')

    /* La page Product affiche "Produit introuvable" via EmptyState quand le slug n'existe pas */
    await expect(page.getByText(/produit introuvable/i)).toBeVisible({ timeout: 8_000 })
  })
})
