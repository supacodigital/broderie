import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env.test') })

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const ADMIN_URL    = process.env.ADMIN_URL    || 'http://localhost:5174'

const API_URL = process.env.API_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  /* Crée le compte client stable avant tous les tests */
  globalSetup: './global-setup.js',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL:       FRONTEND_URL,
    headless:      true,
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
    trace:         'retain-on-failure',
    locale:        'fr-CH',
    timezoneId:    'Europe/Zurich',
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
