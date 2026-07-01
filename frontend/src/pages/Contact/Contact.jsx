import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import axios from 'axios'
import Seo from '../../components/seo/Seo.jsx'
import s from './Contact.module.css'

export default function Contact() {
  const { t } = useTranslation()

  const [form, setForm]     = useState({ name: '', email: '', subject: '', message: '' })
  const [errors, setErrors] = useState({})
  const [sent, setSent]     = useState(false)
  const [sending, setSending] = useState(false)

  function validate() {
    const e = {}
    if (!form.name.trim())    e.name    = 'Votre nom est requis'
    if (!form.email.trim())   e.email   = 'Votre email est requis'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Format invalide'
    if (!form.subject.trim()) e.subject = 'L\'objet est requis'
    if (!form.message.trim()) e.message = 'Votre message est requis'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setSending(true)
    try {
      await axios.post('/api/v1/contact', form)
      setSent(true)
    } catch (err) {
      setErrors({ submit: err.response?.data?.message ?? 'Une erreur est survenue. Veuillez réessayer.' })
    } finally {
      setSending(false)
    }
  }

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    if (errors[e.target.name]) setErrors(er => ({ ...er, [e.target.name]: undefined }))
  }

  return (
    <main className={s.page}>
      <Seo title={t('seo.contactTitle')} description={t('seo.contactDesc')} />
      <div className={s.hero}>
        <p className={s.eyebrow}>Nous écrire</p>
        <h1 className={s.title}>Contactez-nous</h1>
        <p className={s.subtitle}>Une question, une commande spéciale ou simplement envie d'échanger autour de la broderie ? Nous vous répondons sous 24h.</p>
      </div>

      <div className={s.layout}>
        {/* Informations de contact */}
        <aside className={s.info}>
          <div className={s.infoCard}>
            <div className={s.infoItem}>
              <div className={s.infoIcon}><MapPin size={18} /></div>
              <div>
                <p className={s.infoLabel}>Adresse</p>
                <p className={s.infoValue}>Rue de Vuarrengel 10<br />1418 Vuarrens, VD</p>
              </div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoIcon}><Phone size={18} /></div>
              <div>
                <p className={s.infoLabel}>Téléphone</p>
                <p className={s.infoValue}><a href="tel:+41798470126">+41 79 847 01 26</a></p>
              </div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoIcon}><Mail size={18} /></div>
              <div>
                <p className={s.infoLabel}>Email</p>
                <p className={s.infoValue}><a href="mailto:julie@broderie.ch">julie@broderie.ch</a></p>
              </div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoIcon}><Clock size={18} /></div>
              <div>
                <p className={s.infoLabel}>Horaires</p>
                <p className={s.infoValue}>Lun–Ven : 9h–18h<br />Sam : 10h–16h</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Formulaire */}
        <section className={s.formSection}>
          {sent ? (
            <div className={s.success}>
              <div className={s.successIcon}><Send size={28} /></div>
              <h2 className={s.successTitle}>Message envoyé !</h2>
              <p className={s.successDesc}>Merci pour votre message. Nous vous répondrons dans les 24 heures.</p>
              <button className={s.btnSecondary} onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }) }}>
                Envoyer un autre message
              </button>
            </div>
          ) : (
            <form className={s.form} onSubmit={handleSubmit} noValidate>
              <div className={s.row}>
                <div className={s.field}>
                  <label className={s.label} htmlFor="contact-name">Nom complet</label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    className={`${s.input} ${errors.name ? s.inputError : ''}`}
                    placeholder="Marie Dupont"
                    value={form.name}
                    onChange={handleChange}
                    autoComplete="name"
                  />
                  {errors.name && <p className={s.error}>{errors.name}</p>}
                </div>
                <div className={s.field}>
                  <label className={s.label} htmlFor="contact-email">Email</label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    className={`${s.input} ${errors.email ? s.inputError : ''}`}
                    placeholder="marie@email.ch"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                  />
                  {errors.email && <p className={s.error}>{errors.email}</p>}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="contact-subject">Objet</label>
                <input
                  id="contact-subject"
                  name="subject"
                  type="text"
                  className={`${s.input} ${errors.subject ? s.inputError : ''}`}
                  placeholder="Question sur une commande…"
                  value={form.subject}
                  onChange={handleChange}
                />
                {errors.subject && <p className={s.error}>{errors.subject}</p>}
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="contact-message">Message</label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={6}
                  className={`${s.textarea} ${errors.message ? s.inputError : ''}`}
                  placeholder="Votre message…"
                  value={form.message}
                  onChange={handleChange}
                />
                {errors.message && <p className={s.error}>{errors.message}</p>}
              </div>

              {errors.submit && <p className={s.error}>{errors.submit}</p>}
              <button type="submit" className={s.btnPrimary} disabled={sending}>
                {sending ? 'Envoi en cours…' : <><Send size={15} /> Envoyer le message</>}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
