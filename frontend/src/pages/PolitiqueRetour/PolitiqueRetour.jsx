import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, RotateCcw } from 'lucide-react'
import api from '../../services/api.js'
import s from '../CGV/CGV.module.css'

const STATIC_SECTIONS = [
  {
    id: 'delai',
    title: '1. Délai de retour',
    content: `Vous disposez de 14 jours à compter de la réception de votre commande pour retourner tout article qui ne vous conviendrait pas, sans avoir à justifier votre décision.

Ce délai est supérieur au minimum légal de 7 jours prévu par le Code des Obligations suisse (CO), conformément à notre engagement de service client.`,
  },
  {
    id: 'conditions',
    title: '2. Conditions de retour',
    content: `Pour être accepté, le produit retourné doit être :

• Non utilisé et en parfait état
• Dans son emballage d'origine (ou emballage équivalent permettant une protection suffisante)
• Accompagné du bon de livraison ou du numéro de commande

Les articles suivants ne peuvent pas être retournés :
• Articles personnalisés ou sur mesure
• Produits descellés pour raisons d'hygiène (aiguilles, dés à coudre, etc.)
• Articles manifestement utilisés ou endommagés par le client`,
  },
  {
    id: 'procedure',
    title: '3. Procédure de retour',
    content: `1. Contactez notre service client à contact@aupointcompte.ch en indiquant votre numéro de commande et le(s) article(s) à retourner.

2. Nous vous confirmons la prise en charge sous 48h ouvrables et vous indiquons l'adresse de retour.

3. Renvoyez le colis par La Poste Suisse avec un service de suivi. Les frais de retour sont à votre charge.

4. Dès réception et contrôle du retour, nous procédons au remboursement ou à l'échange selon votre choix.`,
  },
  {
    id: 'remboursement',
    title: '4. Remboursement',
    content: `Le remboursement intervient dans les 14 jours suivant la réception du retour par notre équipe.

Le remboursement est effectué par le même moyen de paiement que celui utilisé lors de l'achat :
• Facture → virement bancaire
• Twint → retour sur votre compte Twint
• Carte → retour sur la carte bancaire utilisée

Les frais de port initiaux ne sont pas remboursés (sauf en cas de produit défectueux ou d'erreur de notre part).`,
  },
  {
    id: 'defectueux',
    title: '5. Produit défectueux ou erreur',
    content: `Si vous avez reçu un produit défectueux ou ne correspondant pas à votre commande, contactez-nous immédiatement à contact@aupointcompte.ch avec une photo du produit.

Dans ce cas :
• Les frais de retour sont pris en charge par Au Point-Compté
• Le remboursement intégral (y compris les frais de port) ou l'échange est garanti
• Aucun délai supplémentaire n'est imposé pour ce type de réclamation

Garantie légale : conformément au CO (art. 197), tout défaut constaté à la livraison peut être signalé dans un délai de 2 ans.`,
  },
  {
    id: 'contact',
    title: '6. Contact',
    content: `Pour toute question relative à un retour ou un remboursement :

E-mail : contact@aupointcompte.ch
Téléphone : +41 21 601 XX XX (lun–ven, 9h–17h)

Nous nous engageons à répondre à toute demande dans les 2 jours ouvrables.`,
  },
]

export default function PolitiqueRetour() {
  const [customText, setCustomText] = useState('')

  useEffect(() => {
    api.get('/legal')
      .then(res => setCustomText(res.data?.data?.politique_retour ?? ''))
      .catch(() => {})
  }, [])

  const hasCustom = customText.trim().length > 0

  return (
    <div className={s.page}>
      <div className={s.hero}>
        <div className={s.heroInner}>
          <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
            <Link to="/">Accueil</Link>
            <ChevronRight size={13} />
            <span aria-current="page">Politique de retour</span>
          </nav>
          <div className={s.heroIcon}><RotateCcw size={28} /></div>
          <h1 className={s.heroTitle}>Politique de retour</h1>
          <p className={s.heroSub}>
            Au Point-Compté — broderie-domaine.ch<br />
            Retour sous 14 jours · CO suisse
          </p>
        </div>
      </div>

      <div className={s.layout}>
        {!hasCustom && (
          <aside className={s.toc}>
            <p className={s.tocTitle}>Sommaire</p>
            <nav>
              {STATIC_SECTIONS.map(sec => (
                <a key={sec.id} href={`#${sec.id}`} className={s.tocLink}>
                  {sec.title}
                </a>
              ))}
            </nav>
          </aside>
        )}

        <article className={s.content} style={hasCustom ? { gridColumn: '1 / -1' } : {}}>
          {hasCustom ? (
            <div className={s.customText}>
              {customText.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            STATIC_SECTIONS.map(sec => (
              <section key={sec.id} id={sec.id} className={s.section}>
                <h2 className={s.sectionTitle}>{sec.title}</h2>
                <div className={s.sectionBody}>
                  {sec.content.split('\n\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </section>
            ))
          )}

          <div className={s.footer}>
            <p>
              Pour exercer votre droit de retour, contactez-nous à{' '}
              <a href="mailto:contact@aupointcompte.ch" className={s.mailLink}>
                contact@aupointcompte.ch
              </a>
            </p>
            <Link to="/catalogue" className={s.btnBack}>
              Retour à la boutique
            </Link>
          </div>
        </article>
      </div>
    </div>
  )
}
