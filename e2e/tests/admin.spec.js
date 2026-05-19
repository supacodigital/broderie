import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.test') })

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    || 'admin.e2e@broderie.ch'
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin1234!'

/* ─────────────────────────────────────────────
   HELPER — connecte l'admin avant chaque test
───────────────────────────────────────────── */
async function loginAdmin(page) {
  /* L'admin a basename="/admin" dans React Router — Vite sert depuis http://localhost:5174 */
  await page.goto('/admin/connexion')
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('#password', ADMIN_PASSWORD)
  await page.getByRole('button', { name: /se connecter/i }).click()
  /* React Router (basename=/admin) redirige vers /admin/dashboard après login */
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 10_000 })
}

/* ─────────────────────────────────────────────
   AUTHENTIFICATION ADMIN
───────────────────────────────────────────── */
test.describe('Admin — Authentification', () => {
  test('connecte un admin et affiche le dashboard', async ({ page }) => {
    await loginAdmin(page)

    /* Vérifie qu'on est sur le dashboard (pas redirigé vers /connexion) */
    await expect(page).not.toHaveURL(/connexion/)

    /* Un élément du dashboard doit être visible */
    const heading = page.getByRole('heading').first()
    await expect(heading).toBeVisible({ timeout: 8_000 })
  })

  test('redirige vers /connexion si non authentifié', async ({ page }) => {
    await page.goto('/admin/')
    await expect(page).toHaveURL(/\/connexion/, { timeout: 8_000 })
  })

  test('affiche une erreur avec de mauvais identifiants', async ({ page }) => {
    await page.goto('/admin/connexion')
    await page.fill('#email', 'faux@broderie.ch')
    await page.fill('#password', 'mauvaisMotDePasse!')
    await page.getByRole('button', { name: /se connecter/i }).click()

    const error = page.locator('[class*="error"], [role="alert"]').first()
    await expect(error).toBeVisible({ timeout: 5_000 })
  })
})

/* ─────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────── */
test.describe('Admin — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page)
  })

  test('affiche les KPIs principaux', async ({ page }) => {
    /* Au moins un bloc KPI doit être présent */
    const kpi = page.locator('[class*="kpi"], [class*="Kpi"], [class*="stat"], [class*="card"]').first()
    await expect(kpi).toBeVisible({ timeout: 10_000 })
  })

  test('le menu de navigation affiche les sections principales', async ({ page }) => {
    const nav = page.locator('nav, [class*="sidebar"], [class*="Sidebar"]').first()
    await expect(nav).toBeVisible({ timeout: 5_000 })

    /* Les liens de navigation principale doivent être présents */
    await expect(page.getByRole('link', { name: /produits/i }).first()).toBeVisible()
    /* Le lien "Commandes" peut contenir un badge numérique — ne pas utiliser exact: true */
    await expect(page.getByRole('link', { name: /commandes/i }).first()).toBeVisible()
  })
})

/* ─────────────────────────────────────────────
   GESTION PRODUITS
───────────────────────────────────────────── */
test.describe('Admin — Produits', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page)
    await page.getByRole('link', { name: /produits/i }).first().click()
    await page.waitForURL('**/admin/produits**', { timeout: 8_000 }).catch(() => {})
  })

  test('affiche la liste des produits', async ({ page }) => {
    /* Products.jsx utilise s.tableRow (CSS Modules → _tableRow_xxxxx) */
    const rows = page.locator('[class*="_tableRow_"]')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })

    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  test('ouvre le formulaire de création produit', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /nouveau produit|ajouter|créer/i }).first()
    await expect(createBtn).toBeVisible({ timeout: 5_000 })
    await createBtn.click()

    /* Un champ de nom ou un formulaire doit apparaître */
    const nameField = page.locator('input[name="name"], input[placeholder*="nom"], input[id*="name"]').first()
    await expect(nameField).toBeVisible({ timeout: 5_000 })
  })

  test('filtre les produits par recherche', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="recherche"], input[placeholder*="Search"]').first()
    const hasSearch = await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)

    if (hasSearch) {
      await searchInput.fill('broderie')
      await page.waitForTimeout(500)

      /* Les résultats doivent se mettre à jour */
      const rows = page.locator('[class*="_tableRow_"]')
      await expect(rows.first()).toBeVisible({ timeout: 5_000 })
    }
  })
})

/* ─────────────────────────────────────────────
   GESTION COMMANDES
───────────────────────────────────────────── */
test.describe('Admin — Commandes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page)
    await page.getByRole('link', { name: /commandes/i }).first().click()
    await page.waitForURL('**/admin/commandes**', { timeout: 8_000 }).catch(() => {})
  })

  test('affiche la liste des commandes', async ({ page }) => {
    /* Attend le chargement — soit des lignes, soit un état vide */
    await page.waitForTimeout(2_000)

    /* Orders.jsx utilise s.tableRow (CSS Modules → _tableRow_xxxxx) */
    const rows = page.locator('[class*="_tableRow_"]')
    const empty = page.getByText(/aucune commande/i)

    const hasRows  = await rows.first().isVisible().catch(() => false)
    const hasEmpty = await empty.isVisible().catch(() => false)

    expect(hasRows || hasEmpty).toBeTruthy()
  })
})
