import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.test') })

/* Email unique par run — utilisé uniquement pour inscription/doublons */
const timestamp   = Date.now()
const REG_EMAIL   = `e2e.${timestamp}@test.broderie.ch`
const TEST_PWD    = 'Test1234!'
const FIRST_NAME  = 'Julie'
const LAST_NAME   = 'Test'

/* Compte stable pour les tests qui nécessitent une connexion existante */
const STABLE_EMAIL = process.env.TEST_USER_EMAIL    || 'test.e2e@broderie.ch'
const STABLE_PWD   = process.env.TEST_USER_PASSWORD || 'Test1234!'

/* ─────────────────────────────────────────────
   INSCRIPTION
───────────────────────────────────────────── */
test.describe('Inscription', () => {
  test('crée un compte avec succès et redirige vers /mon-compte', async ({ page }) => {
    await page.goto('/inscription')

    await page.fill('#reg-first-name', FIRST_NAME)
    await page.fill('#reg-last-name', LAST_NAME)
    await page.fill('#reg-email', REG_EMAIL)
    await page.fill('#reg-password', TEST_PWD)
    await page.fill('#reg-password-confirm', TEST_PWD)
    await page.check('#reg-cgv')

    await page.getByRole('button', { name: /créer mon compte/i }).click()

    await page.waitForURL('**/mon-compte', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/mon-compte/)
  })

  test('affiche une erreur si l\'email est déjà utilisé', async ({ page }) => {
    await page.goto('/inscription')

    /* Utilise le même email que le test précédent — doit échouer avec 409 */
    await page.fill('#reg-first-name', FIRST_NAME)
    await page.fill('#reg-last-name', LAST_NAME)
    await page.fill('#reg-email', REG_EMAIL)
    await page.fill('#reg-password', TEST_PWD)
    await page.fill('#reg-password-confirm', TEST_PWD)
    await page.check('#reg-cgv')

    await page.getByRole('button', { name: /créer mon compte/i }).click()

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 })
  })

  test('affiche les erreurs de validation inline si les champs sont vides', async ({ page }) => {
    await page.goto('/inscription')

    await page.getByRole('button', { name: /créer mon compte/i }).click()

    /* Au moins une erreur inline doit apparaître */
    const errors = page.locator('[class*="fieldError"]')
    await expect(errors.first()).toBeVisible({ timeout: 3_000 })
  })
})

/* ─────────────────────────────────────────────
   CONNEXION
───────────────────────────────────────────── */
test.describe('Connexion', () => {
  test('connecte un utilisateur existant et redirige vers /mon-compte', async ({ page }) => {
    /* Utilise le compte stable du .env.test — doit exister en base */
    await page.goto('/connexion')
    await page.fill('#login-email', STABLE_EMAIL)
    await page.fill('#login-password', STABLE_PWD)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()

    await page.waitForURL('**/mon-compte', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/mon-compte/)
  })

  test('affiche une erreur avec des identifiants incorrects', async ({ page }) => {
    /* Efface les cookies pour éviter que l'intercepteur Axios tente un refresh token
       sur le 401 de /auth/login — ce qui déclencherait window.location.href='/connexion' */
    await page.context().clearCookies()

    await page.goto('/connexion')
    await page.fill('#login-email', 'inconnu@test.broderie.ch')
    await page.fill('#login-password', 'mauvaisMotDePasse!')

    /* Clique et attend la réponse 401 */
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/auth/login') && r.status() === 401, { timeout: 8_000 }),
      page.getByRole('button', { name: 'Se connecter', exact: true }).click(),
    ])

    /* Laisse le temps à React de mettre à jour le DOM */
    await page.waitForTimeout(300)

    /* Cherche le message d'erreur global (class CSS Modules) ou role="alert" */
    const alert = page.locator('[class*="globalError"], [role="alert"]').first()
    await expect(alert).toBeVisible({ timeout: 5_000 })
  })
})

/* ─────────────────────────────────────────────
   DÉCONNEXION
───────────────────────────────────────────── */
test.describe('Déconnexion', () => {
  test('déconnecte l\'utilisateur et redirige vers /', async ({ page }) => {
    /* Utilise le compte stable du .env.test */
    await page.goto('/connexion')
    await page.fill('#login-email', STABLE_EMAIL)
    await page.fill('#login-password', STABLE_PWD)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.waitForURL('**/mon-compte', { timeout: 10_000 })

    /* Clique sur le bouton de déconnexion — desktop (aria-label) ou mobile (texte) */
    const logoutBtn = page.locator('[aria-label="Déconnexion"]').first()
    await expect(logoutBtn).toBeVisible({ timeout: 3_000 })
    await logoutBtn.click()

    /* Attend que la page quitte /mon-compte (redirect vers / ou /connexion transitoire) */
    await page.waitForURL(url => !url.toString().includes('/mon-compte'), { timeout: 8_000 })

    /* Vérifie que l'accès à /mon-compte est bloqué après déconnexion */
    await page.goto('/mon-compte')
    await expect(page).toHaveURL(/\/connexion/)
  })
})
