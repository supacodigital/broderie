import SecurityTab from '../Settings/SecurityTab.jsx'
import s from './Account.module.css'

/* « Mon compte » du super-administrateur : mot de passe et double
   authentification. Il n'a pas accès aux Paramètres de la boutique, où ces
   réglages se trouvent pour l'administrateur (onglet Sécurité). */
export default function Account() {
  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>Mon compte</h1>
        <p className={s.pageDesc}>Mot de passe et double authentification de votre compte.</p>
      </div>
      <div className={s.content}>
        <SecurityTab />
      </div>
    </div>
  )
}
