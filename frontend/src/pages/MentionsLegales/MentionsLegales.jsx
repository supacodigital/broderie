import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Scale } from 'lucide-react'
import api from '../../services/api.js'
import s from '../CGV/CGV.module.css'

const STATIC_SECTIONS = [
  {
    id: 'editeur',
    title: '1. Éditeur du site',
    content: `Dénomination sociale : Au Point-Compté
Forme juridique : Raison individuelle / Sàrl (à compléter)
Numéro IDE : CHE-XXX.XXX.XXX (à compléter)
Adresse : Rue du Simplon 12, 1006 Lausanne, VD, Suisse
Téléphone : +41 21 601 XX XX
E-mail : contact@aupointcompte.ch

Responsable éditorial : (Nom du responsable à compléter)`,
  },
  {
    id: 'hebergement',
    title: '2. Hébergement',
    content: `Le site est hébergé par :
Infomaniak Network SA
Rue Eugène-Marziano 25
1227 Les Acacias (Genève), Suisse

Les données sont hébergées exclusivement en Suisse, conformément à la Loi fédérale sur la protection des données (LPD).`,
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

Responsable du traitement : Au Point-Compté, contact@aupointcompte.ch

Données collectées : nom, prénom, adresse de livraison, adresse e-mail, téléphone, données de navigation anonymisées.

Finalités : traitement des commandes, relation client, amélioration du service.

Conservation : les données sont conservées pendant la durée légale applicable (10 ans pour les données comptables, 5 ans pour les données clients après la dernière interaction).

Droits : accès, rectification, suppression, portabilité. Demandes à adresser à contact@aupointcompte.ch.`,
  },
  {
    id: 'cookies',
    title: '5. Cookies',
    content: `Le site utilise des cookies strictement nécessaires au fonctionnement (session, panier, authentification) et des cookies analytiques anonymisés (avec votre consentement).

Aucun cookie publicitaire tiers n'est déposé sans consentement explicite. Vous pouvez à tout moment modifier vos préférences via le bandeau de consentement.`,
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

export default function MentionsLegales() {
  const [customText, setCustomText] = useState('')

  useEffect(() => {
    api.get('/legal')
      .then(res => setCustomText(res.data?.data?.mentions_legales ?? ''))
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
            <span aria-current="page">Mentions légales</span>
          </nav>
          <div className={s.heroIcon}><Scale size={28} /></div>
          <h1 className={s.heroTitle}>Mentions légales</h1>
          <p className={s.heroSub}>
            Au Point-Compté — broderie-domaine.ch<br />
            Dernière mise à jour : 1<sup>er</sup> mai 2026
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
              Pour toute question, contactez-nous à{' '}
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
