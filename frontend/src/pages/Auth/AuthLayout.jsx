import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import LoginForm from './LoginForm.jsx'
import RegisterForm from './RegisterForm.jsx'
import s from './AuthLayout.module.css'

/* Layout d'authentification partagé : connexion + inscription montés ensemble.
   Le panneau de marque glisse de gauche/droite selon la route active, ce qui
   produit une transition fluide entre /connexion et /inscription sans démontage. */
export default function AuthLayout() {
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  /* Mode déduit de l'URL — le composant reste monté entre les deux routes */
  const isRegister = location.pathname.startsWith('/inscription')

  /* Bascule vers l'autre route : seul le mode change → le panneau glisse */
  const switchMode = () => {
    navigate(isRegister ? '/connexion' : '/inscription')
  }

  return (
    <div className={s.page}>
      <div className={`${s.shell} ${isRegister ? s.shellRegister : ''}`}>

        {/* ── Formulaire connexion (colonne gauche en mode login) ── */}
        <div className={`${s.formPane} ${s.formLogin}`} aria-hidden={isRegister}>
          <div className={s.formInner}>
            <LoginForm />
          </div>
        </div>

        {/* ── Formulaire inscription (colonne gauche en mode register) ── */}
        <div className={`${s.formPane} ${s.formRegister}`} aria-hidden={!isRegister}>
          <div className={s.formInner}>
            <RegisterForm />
          </div>
        </div>

        {/* ── Panneau de marque glissant (dégradé rose) ── */}
        <aside className={s.aside}>
          {/* Contenu connexion */}
          <div className={`${s.asideContent} ${isRegister ? s.asideHidden : ''}`} aria-hidden={isRegister}>
            <span className={s.asideLogo}>✦ Au Point-Compté</span>
            <p className={s.asideTagline}>{t('auth.aside.tagline')}</p>
            <p className={s.asideSubtext}>{t('auth.aside.subtext')}</p>

            <ul className={s.asidePerks} role="list">
              <li className={s.asidePerk}><span className={s.asidePerkIcon}><Check size={14} /></span>{t('auth.aside.perk1')}</li>
              <li className={s.asidePerk}><span className={s.asidePerkIcon}><Check size={14} /></span>{t('auth.aside.perk2')}</li>
              <li className={s.asidePerk}><span className={s.asidePerkIcon}><Check size={14} /></span>{t('auth.aside.perk3')}</li>
            </ul>

            <div className={s.asideSwitch}>
              <span>{t('auth.aside.switchToRegisterPrompt')}</span>
              <button type="button" className={s.asideSwitchBtn} onClick={switchMode}>
                {t('auth.aside.switchToRegisterCta')}
              </button>
            </div>
          </div>

          {/* Contenu inscription */}
          <div className={`${s.asideContent} ${!isRegister ? s.asideHidden : ''}`} aria-hidden={!isRegister}>
            <span className={s.asideLogo}>✦ Au Point-Compté</span>
            <p className={s.asideTagline}>{t('auth.aside.registerTagline')}</p>
            <p className={s.asideSubtext}>{t('auth.aside.registerSubtext')}</p>

            <ul className={s.asidePerks} role="list">
              <li className={s.asidePerk}><span className={s.asidePerkIcon}><Check size={14} /></span>{t('auth.aside.perk1')}</li>
              <li className={s.asidePerk}><span className={s.asidePerkIcon}><Check size={14} /></span>{t('auth.aside.perk2')}</li>
              <li className={s.asidePerk}><span className={s.asidePerkIcon}><Check size={14} /></span>{t('auth.aside.perk3')}</li>
            </ul>

            <div className={s.asideSwitch}>
              <span>{t('auth.aside.switchToLoginPrompt')}</span>
              <button type="button" className={s.asideSwitchBtn} onClick={switchMode}>
                {t('auth.aside.switchToLoginCta')}
              </button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  )
}
