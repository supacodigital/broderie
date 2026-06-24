import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/* On charge l'env PROD avant tout — les specs lisent .env.test, donc on
   pointe le même fichier via dotenv override plus bas n'est pas possible :
   on duplique les valeurs ici et on force aussi process.env pour les specs. */
dotenv.config({ path: path.join(__dirname, '.env.prod-test') })

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://179.237.87.29'
const ADMIN_URL    = process.env.ADMIN_URL    || 'https://179.237.87.29'

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  retries: 1,
  workers: 1,

  /* Crée le compte client stable avant tous les tests (via l'API prod) */
  globalSetup: './global-setup.js',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-prod', open: 'never' }],
  ],

  use: {
    baseURL:            FRONTEND_URL,
    headless:           true,
    /* Certificat HTTPS sur IP (auto-signé / non conforme SNI) */
    ignoreHTTPSErrors:  true,
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
    trace:              'retain-on-failure',
    locale:             'fr-CH',
    timezoneId:         'Europe/Zurich',
  },

  projects: [
    {
      name: 'frontend',
      use: { ...devices['Desktop Chrome'], baseURL: FRONTEND_URL },
      testMatch: ['**/auth.spec.js', '**/catalogue.spec.js', '**/cart.spec.js', '**/checkout.spec.js'],
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
      testMatch: ['**/admin.spec.js', '**/admin-products.spec.js', '**/admin-orders.spec.js'],
    },
  ],
})
