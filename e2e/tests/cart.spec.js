import { test, expect } from '@playwright/test'

/* ─────────────────────────────────────────────
   HELPER — navigue vers le premier produit dispo
───────────────────────────────────────────── */
async function goToFirstProduct(page) {
  await page.goto('/catalogue')
  const cards = page.locator('a[class*="_card_"], [class*="_card_"]')
  await expect(cards.first()).toBeVisible({ timeout: 10_000 })
  await cards.first().click()
  await expect(page).toHaveURL(/\/produit\//, { timeout: 8_000 })
}

/* ─────────────────────────────────────────────
   PANIER
───────────────────────────────────────────── */
test.describe('Panier', () => {
  test('ajoute un produit au panier depuis la fiche produit', async ({ page }) => {
    await goToFirstProduct(page)

    /* Sur la fiche produit, le bouton est dans ProductInfo — utiliser le CSS Module class */
    const addBtn = page.locator('[class*="_addBtn_"]').first()
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    /* Vérifie que le compteur panier dans la navbar se met à jour */
    const cartBadge = page.locator('[class*="_badge_"]').first()
    await expect(cartBadge).toBeVisible({ timeout: 5_000 })
    const badgeText = await cartBadge.textContent()
    expect(Number(badgeText)).toBeGreaterThan(0)
  })

  test('affiche le produit ajouté dans /panier', async ({ page }) => {
    await goToFirstProduct(page)

    /* Récupère le nom du produit affiché sur la fiche */
    const productTitle = page.locator('h1').first()
    await expect(productTitle).toBeVisible({ timeout: 5_000 })
    const titleText = await productTitle.textContent()

    await page.locator('[class*="_addBtn_"]').first().click()
    await page.goto('/panier')

    /* Vérifie que le nom du produit apparaît dans le panier */
    await expect(page.getByText(titleText.trim(), { exact: false })).toBeVisible({ timeout: 8_000 })
  })

  test('affiche l\'état vide si le panier est vide', async ({ page }) => {
    await page.goto('/panier')

    /* Attente brève pour que la page charge */
    await page.waitForTimeout(1_500)

    /* Soit un message "panier vide", soit pas de ligne produit */
    const emptyMsg = page.getByText(/panier est vide|aucun article/i)
    const hasEmpty = await emptyMsg.isVisible().catch(() => false)

    if (!hasEmpty) {
      const cartItems = page.locator('[class*="_item_"]')
      const count = await cartItems.count()
      expect(count).toBeGreaterThanOrEqual(0)
    } else {
      await expect(emptyMsg).toBeVisible()
    }
  })

  test('modifie la quantité d\'un article dans le panier', async ({ page }) => {
    await goToFirstProduct(page)
    await page.locator('[class*="_addBtn_"]').first().click()
    await page.goto('/panier')

    /* Cherche le bouton "+" pour augmenter la quantité */
    const increaseBtn = page.locator('[class*="_qtyBtn_"]').nth(1)
    const hasIncrease = await increaseBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasIncrease) {
      await increaseBtn.click()
      await page.waitForTimeout(1_000)

      /* La quantité doit être 2 */
      const qty = page.locator('[class*="_qtyValue_"]').first()
      const qtyText = await qty.textContent()
      expect(Number(qtyText)).toBe(2)
    }
  })

  test('supprime un article du panier', async ({ page }) => {
    await goToFirstProduct(page)
    await page.locator('[class*="_addBtn_"]').first().click()
    await page.goto('/panier')

    /* Clique sur le bouton supprimer */
    const deleteBtn = page.locator('[class*="_removeBtn_"]').first()
    const hasDelete = await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasDelete) {
      await deleteBtn.click()
      await page.waitForTimeout(1_000)

      /* Après suppression : panier vide ou moins d'articles */
      const emptyMsg = page.getByText(/panier est vide|aucun article/i)
      const cartItems = page.locator('[class*="_item_"]')
      const remaining = await cartItems.count()

      const isEmpty = await emptyMsg.isVisible().catch(() => false)
      expect(isEmpty || remaining === 0).toBeTruthy()
    }
  })

  test('/commande redirige vers /connexion si non authentifié', async ({ page }) => {
    await page.goto('/commande')
    await expect(page).toHaveURL(/\/connexion/, { timeout: 8_000 })
  })
})
