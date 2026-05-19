import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env.test') })

/* Crée les comptes de test stables si ils n'existent pas encore en base */
export default async function globalSetup() {
  const API_URL      = process.env.API_URL      || 'http://localhost:3000'
  const userEmail    = process.env.TEST_USER_EMAIL    || 'test.e2e@broderie.ch'
  const userPassword = process.env.TEST_USER_PASSWORD || 'Test1234!'

  const res = await fetch(`${API_URL}/api/v1/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email:     userEmail,
      password:  userPassword,
      firstName: 'Test',
      lastName:  'E2E',
    }),
  })

  /* 201 = compte créé, 409 = déjà existant — les deux sont acceptables */
  if (res.status !== 201 && res.status !== 409) {
    const body = await res.text()
    console.warn(`[global-setup] Création compte client inattendue (${res.status}): ${body}`)
  } else {
    const action = res.status === 201 ? 'créé' : 'déjà existant'
    console.log(`[global-setup] Compte client ${action} : ${userEmail}`)
  }
}
