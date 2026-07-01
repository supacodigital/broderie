import { AlertCircle } from 'lucide-react'
import s from './AuthForm.module.css'

/* ── Champ de formulaire auth accessible ──
   Gère label + astérisque obligatoire, aria-invalid, aria-describedby vers
   le message d'erreur et role=alert pour l'annonce lecteur d'écran.
   `children` permet d'injecter un champ personnalisé (ex. mot de passe avec bouton œil) ;
   sinon un <input> standard est rendu. */
export default function AuthField({
  id, label, error, required = false, register, name,
  t, children, ...inputProps
}) {
  const errorId = `${id}-error`
  const describedBy = error ? errorId : undefined

  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>
        {label}
        {required && (
          <>
            <span className={s.requiredMark} aria-hidden="true"> *</span>
            <span className={s.srOnly}> ({t('form.requiredField')})</span>
          </>
        )}
      </label>
      {children
        ? children({ errorId: describedBy })
        : (
          <input
            id={id}
            className={`${s.input} ${error ? s.error : ''}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            {...(register ? register(name) : {})}
            {...inputProps}
          />
        )}
      {error && (
        <span id={errorId} className={s.fieldError} role="alert">
          <AlertCircle size={12} aria-hidden="true" />{error.message}
        </span>
      )}
    </div>
  )
}
