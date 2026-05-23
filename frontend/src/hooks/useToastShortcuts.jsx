import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, AlertCircle, Info } from 'lucide-react'
import { useToast } from '../contexts/ToastContext.jsx'

/* Raccourcis typés pour le système de toasts.
   Centralise les variantes (success/error/info) afin que l'appelant ne se soucie
   pas du choix d'icône, de durée ou de bouton d'action. */
export function useToastShortcuts() {
  const { showToast } = useToast()
  const { t } = useTranslation()

  /* Mémoïsé pour ne pas recréer les fonctions à chaque rendu de l'appelant */
  return useMemo(() => ({
    /* Confirmation positive — icône check, durée standard */
    success(message, action) {
      return showToast({
        variant: 'success',
        icon: <Check size={14} />,
        message,
        action,
      })
    },

    /* Erreur — icône alerte, durée plus longue, bouton « Réessayer » optionnel */
    error(message, retry) {
      return showToast({
        variant: 'error',
        icon: <AlertCircle size={14} />,
        message,
        duration: 6000,
        action: retry ? { onClick: retry, label: t('errors.retry') } : undefined,
      })
    },

    /* Information neutre — icône info, action optionnelle */
    info(message, action) {
      return showToast({
        variant: 'info',
        icon: <Info size={14} />,
        message,
        action,
      })
    },

    /* Accès brut au showToast pour les cas hors raccourcis (icône custom, etc.) */
    raw: showToast,
  }), [showToast, t])
}
