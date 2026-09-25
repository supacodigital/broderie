import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Scale } from 'lucide-react'
import { getLegalContent } from '../../services/legal.service.js'
import s from '../CGV/CGV.module.css'

const STATIC_SECTIONS = [
  {
    id: 'editeur',
    title: '1. Éditeur du site',
    content: `Nom commercial\u00a0: Au Point-Compté
Titulaire\u00a0: Julie Guerle, raison individuelle
Numéro IDE / TVA\u00a0: CHE-201.783.009 TVA
Adresse\u00a0: Chemin du Collège 6, 1509 Vucherens, VD, Suisse
Téléphone\u00a0: +41 79 847 01 26
E-mail\u00a0: julie@broderie.ch

Responsable éditorial\u00a0: Julie Guerle`,
  },
  {
    id: 'hebergement',
    title: '2. Hébergement',
    content: `Le site est hébergé par :
Infomaniak Network SA
Rue Eugène-Marziano 25
1227 Les Acacias (Genève), Suisse

Le site, sa base de données et ses sauvegardes sont hébergés en Suisse. Les prestataires qui reçoivent des données, en Suisse et à l'étranger, sont indiqués à la section 4.`,
  },
  {
    id: 'propriete',
    title: '3. Propriété intellectuelle',
    content: `L'ensemble des contenus présents sur ce site (textes, images, photographies, logos, vidéos, graphismes) sont protégés par le droit d'auteur suisse (LDA) et sont la propriété exclusive d'Au Point-Compté ou de ses partenaires.

Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite sans autorisation écrite préalable.`,
  },
  {
    id: 'donnees',
    title: '4. Données personnelles et LPD',
    content: `Le traitement des données personnelles est régi par la Loi fédérale sur la protection des données (LPD, révisée au 1er septembre 2023).

Responsable du traitement\u00a0: Julie Guerle, Au Point-Compté, Chemin du Collège 6, 1509 Vucherens — julie@broderie.ch

Données collectées\u00a0: nom, prénom, adresses de livraison et de facturation, adresse e-mail, téléphone, commandes et factures, avis publiés, liste de favoris, inscription à la newsletter, ainsi que le choix exprimé dans le bandeau cookies (l'adresse IP associée est rendue non identifiable). Les données de carte bancaire ne sont jamais reçues ni conservées par la boutique\u00a0: elles sont saisies directement chez Stripe.

Finalités\u00a0: traitement des commandes, relation client, amélioration du service, et envoi de la newsletter aux seules personnes qui l'ont demandée et confirmée par e-mail. Ce consentement se retire à tout moment, en un clic, grâce au lien présent dans chaque newsletter.

Prestataires qui reçoivent des données\u00a0:
– Infomaniak Network SA (Genève, Suisse)\u00a0: hébergement du site et envoi des e-mails\u00a0;
– La Poste Suisse SA (Berne, Suisse)\u00a0: livraison des colis (nom et adresse de livraison)\u00a0;
– Stripe (Stripe Payments Europe Ltd, Dublin, Irlande)\u00a0: paiements par carte et par Twint.

Transferts à l'étranger\u00a0: seuls les paiements par carte et par Twint quittent la Suisse. Stripe les traite en Irlande, pays dont la législation assure une protection adéquate selon le Conseil fédéral\u00a0; certaines données peuvent aussi être traitées par Stripe, Inc. aux États-Unis, entreprise certifiée selon le Swiss-U.S. Data Privacy Framework. Les paiements par facture QR et en boutique ne font intervenir aucun prestataire à l'étranger.

Conservation\u00a0: les données sont conservées pendant la durée légale applicable (10 ans pour les données comptables, 5 ans pour les données clients après la dernière interaction).

Droits\u00a0: accès, rectification, suppression, portabilité. Depuis votre espace client, vous pouvez télécharger l'ensemble de vos données et supprimer votre compte. Les autres demandes sont à adresser à julie@broderie.ch.`,
  },
  {
    id: 'cookies',
    title: '5. Cookies',
    content: `Le site n'utilise que des cookies nécessaires à son fonctionnement\u00a0:
– cartSession\u00a0: conserve votre panier pendant 30 jours\u00a0;
– refreshToken\u00a0: maintient la connexion à votre compte pendant 7 jours, uniquement si vous vous connectez.

Au moment du paiement par carte ou par Twint, Stripe dépose ses propres cookies, nécessaires à la sécurité de la transaction et à la prévention de la fraude.

Le site mémorise aussi dans votre navigateur, sans cookie, votre choix dans le bandeau cookies, la fermeture du bandeau d'annonce, vos dernières recherches et l'affichage choisi pour le catalogue. Ces mémos restent dans votre navigateur.

Aucun cookie publicitaire ni de mesure d'audience n'est utilisé, et aucun service tiers n'est contacté lorsque vous parcourez la boutique. Vous pouvez bloquer ou supprimer les cookies dans les réglages de votre navigateur\u00a0; le panier et la connexion à votre compte ne fonctionneront alors plus.`,
  },
  {
    id: 'responsabilite',
    title: '6. Limitation de responsabilité',
    content: `Au Point-Compté s'efforce de maintenir le site accessible en permanence mais ne saurait être tenu responsable des interruptions dues à des opérations de maintenance, des pannes techniques ou des cas de force majeure.

Les informations présentes sur le site sont fournies à titre indicatif. Au Point-Compté se réserve le droit de les modifier sans préavis.`,
  },
  {
    id: 'litiges',
    title: '7. Droit applicable',
    content: `Les présentes mentions légales sont soumises au droit suisse. Pour tout litige, les tribunaux du canton de Vaud sont seuls compétents.`,
  },
]

/* Un paragraphe peut contenir des retours à la ligne simples (coordonnées,
   listes) : ils s'affichaient bout à bout, sur une seule ligne continue. */
function Paragraph({ text }) {
  const lines = text.split('\n')
  return (
    <p>
      {lines.map((line, i) => (
        <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>
      ))}
    </p>
  )
}

export default function MentionsLegales() {
  const [customText, setCustomText] = useState('')
  const { hash } = useLocation()

  useEffect(() => {
    getLegalContent()
      .then(res => setCustomText(res.data?.mentions_legales ?? ''))
      .catch(() => {})
  }, [])

  const hasCustom = customText.trim().length > 0

  /* Lien vers une section (« /mentions-legales#donnees » depuis le bandeau
     cookies ou les e-mails) : la page s'ouvrait en haut, la section n'existant
     pas encore au moment où le navigateur cherche l'ancre. */
  useEffect(() => {
    if (!hash || hasCustom) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
  }, [hash, hasCustom])

  return (
    <div className={s.page}>
      <div className={s.hero}>
        <div className={s.heroInner}>
          <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
            <Link to="/">Accueil</Link>
            <ChevronRight size={13} />
            <span aria-current="page">Mentions légales</span>
          </nav>
          <div className={s.heroIcon}><Scale size={28} /></div>
          <h1 className={s.heroTitle}>Mentions légales</h1>
          <p className={s.heroSub}>
            Au Point-Compté — broderie.ch<br />
            Dernière mise à jour : 25 septembre 2026
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
                <Paragraph key={i} text={para} />
              ))}
            </div>
          ) : (
            STATIC_SECTIONS.map(sec => (
              <section key={sec.id} id={sec.id} className={s.section}>
                <h2 className={s.sectionTitle}>{sec.title}</h2>
                <div className={s.sectionBody}>
                  {sec.content.split('\n\n').map((para, i) => (
                    <Paragraph key={i} text={para} />
                  ))}
                </div>
              </section>
            ))
          )}

          <div className={s.footer}>
            <p>
              Pour toute question, contactez-nous à{' '}
              <a href="mailto:julie@broderie.ch" className={s.mailLink}>
                julie@broderie.ch
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
