import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import api from '../../services/api.js'
import s from './CGV.module.css'

const STATIC_SECTIONS = [
  {
    id: 'objet',
    title: '1. Objet et champ d\'application',
    content: `Les présentes Conditions Générales de Vente (ci-après « CGV ») régissent l'ensemble des relations contractuelles entre Au Point-Compté (ci-après « le Vendeur ») et toute personne physique effectuant un achat sur le site broderie-domaine.ch (ci-après « le Client »).

Tout achat implique l'acceptation pleine et entière des présentes CGV. Le Vendeur se réserve le droit de modifier les CGV à tout moment ; la version applicable est celle en vigueur au moment de la commande.

Au Point-Compté commercialise exclusivement sur le territoire suisse.`,
  },
  {
    id: 'produits',
    title: '2. Produits et disponibilité',
    content: `Les produits proposés sont conformes à la législation suisse en vigueur. Chaque fiche produit présente les caractéristiques essentielles du bien. Les photographies sont reproduites fidèlement mais ne constituent pas un engagement contractuel.

Les offres sont valables dans la limite des stocks disponibles. En cas d'indisponibilité d'un produit après passation de la commande, le Client est informé par e-mail dans les meilleurs délais et peut choisir entre le remboursement intégral ou un produit de remplacement équivalent.`,
  },
  {
    id: 'prix',
    title: '3. Prix et TVA',
    content: `Tous les prix sont indiqués en francs suisses (CHF), toutes taxes comprises (TTC). La TVA applicable est la TVA suisse selon les taux en vigueur :

• Taux normal 8,1 % — articles de mercerie, accessoires, matériaux de broderie
• Taux réduit 2,6 % — livres, publications

Le détail de la TVA est mentionné sur chaque facture conformément aux obligations légales suisses (LTVA). Les prix peuvent être modifiés à tout moment ; le prix facturé est celui affiché au moment de la validation de la commande. Les arrondis sont effectués au 0.05 CHF le plus proche, conformément aux règles de l'arrondi suisse.`,
  },
  {
    id: 'commande',
    title: '4. Passation et confirmation de commande',
    content: `La commande est réputée ferme et définitive dès la validation du paiement ou l'acceptation d'une commande par facture. Le Client reçoit un e-mail de confirmation de commande dans les 30 minutes suivant la validation, récapitulant les articles commandés, les quantités, le prix TTC détaillé et les informations de livraison.

Le Vendeur se réserve le droit de refuser toute commande d'un Client avec lequel un litige antérieur est en cours.`,
  },
  {
    id: 'paiement',
    title: '5. Modalités de paiement',
    content: `Les moyens de paiement acceptés sont :

• Facture (paiement dans les 30 jours suivant réception)
• Twint (QR code envoyé par e-mail)
• Carte bancaire Visa / Mastercard (traitement sécurisé via Stripe)
• PostFinance Card (disponible prochainement)

Le paiement est sécurisé. Les données bancaires ne sont jamais stockées sur nos serveurs. En cas de non-paiement à l'échéance d'une facture, des intérêts de retard de 5 % l'an sont applicables conformément au Code des Obligations suisse (CO art. 104).`,
  },
  {
    id: 'livraison',
    title: '6. Livraison',
    content: `La livraison s'effectue exclusivement en Suisse via La Poste Suisse (Post CH). Les frais de port sont forfaitaires et indiqués au moment de la commande.

Délai de livraison : 1 à 2 jours ouvrables après confirmation du paiement. Un numéro de suivi Post CH est communiqué par e-mail dès l'expédition.

Le Vendeur décline toute responsabilité en cas de retard imputable à La Poste Suisse ou à un cas de force majeure.`,
  },
  {
    id: 'retour',
    title: '7. Droit de retour et remboursement',
    content: `Conformément au Code des Obligations suisse (CO) et aux recommandations de la Commission de la concurrence (COMCO), le Client dispose d'un délai de 14 jours à compter de la réception de la commande pour retourner tout article non utilisé, dans son emballage d'origine et en parfait état.

Pour exercer ce droit, le Client doit contacter le service client à noreply@broderie-domaine.ch avant tout retour. Les frais de retour sont à la charge du Client.

Le remboursement intervient dans les 14 jours suivant réception du retour, par le même moyen de paiement que celui utilisé lors de l'achat. Les articles personnalisés ou hygiéniques ouverts ne peuvent être repris.`,
  },
  {
    id: 'garantie',
    title: '8. Garanties légales',
    content: `Les produits bénéficient de la garantie légale contre les défauts conformément au CO (art. 197 et suivants). En cas de défaut constaté à la livraison, le Client dispose de 2 ans pour agir.

En cas de produit défectueux, le Vendeur procède au remplacement ou au remboursement, au choix du Client.`,
  },
  {
    id: 'donnees',
    title: '9. Protection des données (LPD)',
    content: `Le traitement des données personnelles est régi par la Loi fédérale sur la protection des données (LPD, révisée au 1er septembre 2023). Les données collectées (nom, adresse, e-mail) sont utilisées exclusivement pour le traitement des commandes et la relation client.

Les données sont hébergées en Suisse (Infomaniak, Genève) et ne sont pas transmises à des tiers sans consentement explicite. Le Client dispose d'un droit d'accès, de rectification et de suppression de ses données.

Pour exercer ces droits : noreply@broderie-domaine.ch. Toute violation de données sera notifiée aux autorités compétentes dans les 72 heures.`,
  },
  {
    id: 'cookies',
    title: '10. Cookies et consentement',
    content: `Le site utilise des cookies fonctionnels nécessaires au fonctionnement du panier et de l'authentification. Des cookies analytiques anonymisés peuvent être utilisés avec votre consentement explicite, conformément à la LPD révisée.

Un bandeau de consentement vous permet de gérer vos préférences. Le refus des cookies non essentiels n'entrave pas la navigation ni le processus d'achat.`,
  },
  {
    id: 'litiges',
    title: '11. Droit applicable et litiges',
    content: `Les présentes CGV sont soumises au droit suisse. En cas de litige, les parties s'engagent à rechercher une solution amiable. À défaut, le tribunal compétent sera celui du domicile du Vendeur en Suisse.

Pour toute réclamation : noreply@broderie-domaine.ch — nous nous engageons à répondre dans les 5 jours ouvrables.`,
  },
]

export default function CGV() {
  const [customText, setCustomText] = useState('')

  useEffect(() => {
    api.get('/legal')
      .then(res => setCustomText(res.data?.data?.cgv ?? ''))
      .catch(() => {})
  }, [])

  /* Si l'admin a saisi un texte personnalisé, on l'affiche seul */
  const hasCustom = customText.trim().length > 0

  return (
    <div className={s.page}>
      {/* ── En-tête ── */}
      <div className={s.hero}>
        <div className={s.heroInner}>
          <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
            <Link to="/">Accueil</Link>
            <ChevronRight size={13} />
            <span aria-current="page">Conditions générales de vente</span>
          </nav>
          <div className={s.heroIcon}><FileText size={28} /></div>
          <h1 className={s.heroTitle}>Conditions Générales de Vente</h1>
          <p className={s.heroSub}>
            Au Point-Compté — broderie-domaine.ch<br />
            Dernière mise à jour : 1<sup>er</sup> mai 2026
          </p>
        </div>
      </div>

      <div className={s.layout}>
        {/* ── Sommaire ── */}
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

        {/* ── Contenu ── */}
        <article className={s.content} style={hasCustom ? { gridColumn: '1 / -1' } : {}}>
          {hasCustom ? (
            /* Texte saisi dans l'admin — affiché en bloc */
            <div className={s.customText}>
              {customText.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            /* Contenu statique de référence */
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
              Pour toute question relative à ces conditions, contactez-nous à{' '}
              <a href="mailto:noreply@broderie-domaine.ch" className={s.mailLink}>
                noreply@broderie-domaine.ch
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
