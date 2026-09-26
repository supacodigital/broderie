import { House, BookOpen, Megaphone, FileText, Mail } from 'lucide-react'
import { hero, crafts, advantages, about } from '@shop-texts'

/* Espace « Contenu du site » du super-administrateur : les pages, leurs
   textes, et l'apparence d'origine de chaque texte sur la boutique.

   `look` décrit cette apparence telle que la définissent les feuilles de style
   de la boutique (HeroSection.module.css, NotreHistoire.module.css…) : c'est le
   point de départ de la mise en forme et de son aperçu. À mettre à jour si le
   design de la boutique change. `bg` : fond du bloc, pour l'aperçu et le
   contraste. `sample` : texte actuellement affiché quand le champ est vide
   (textes d'origine de la boutique). `path` : page de la boutique où
   s'affiche le texte, quand ce n'est pas celle de la section (textes légaux). */

export const SECTIONS = [
  { slug: 'accueil',        page: 'home',   label: 'Page d’accueil',     icon: House,     shopPath: '/',
    desc: 'Bandeau principal, bloc « Notre histoire » et avantages.' },
  { slug: 'notre-histoire', page: 'about',  label: 'Notre Histoire',     icon: BookOpen,  shopPath: '/notre-histoire',
    desc: 'La page « Qui sommes-nous ».' },
  { slug: 'bandeau',        page: 'banner', label: 'Bandeau d’annonce',  icon: Megaphone, shopPath: '/',
    desc: 'Le message tout en haut de la boutique : promotion, fermeture, délais.' },
  { slug: 'textes-legaux',  page: 'legal',  label: 'Textes légaux',      icon: FileText,  shopPath: '/cgv',
    desc: 'Conditions générales de vente, mentions légales, politique de retour.' },
  { slug: 'e-mails',        page: 'emails', label: 'E-mails',            icon: Mail,      shopPath: null,
    desc: 'Textes des e-mails envoyés à l’inscription.' },
]

export const sectionBySlug = (slug) => SECTIONS.find(sec => sec.slug === slug)

// Polices des feuilles de style de la boutique
const FONTS = {
  montserrat: { fontKey: 'montserrat',       family: "'Montserrat', sans-serif" },
  cormorant:  { fontKey: 'cormorant-infant', family: "'Cormorant Infant', serif" },
  vibes:      { fontKey: 'great-vibes',      family: "'Great Vibes', cursive" },
  /* Prévue par la feuille de style mais jamais chargée par la boutique : le
     navigateur affiche sa police à empattement par défaut, l'aperçu aussi. */
  playfair:   { fontKey: null,               family: "'Playfair Display', serif" },
}

const look = (font, weight, size, color, more = {}) => ({
  ...FONTS[font], weight, size, color,
  align: 'left', italic: false, uppercase: false, underline: false, lineHeight: 1.2, letterSpacing: 0,
  ...more,
})

// Fonds des blocs sur la boutique
const BG = {
  heroPink:  '#fdeef7',  // bandeau principal (uni sur Natel, photo claire sur grand écran)
  rosePale:  '#fdf2f8',  // --rose-pale
  aboutHero: '#fce7f3',  // en-tête de « Notre Histoire »
  rose:      '#db2777',  // boutons, bandeau d'annonce
  white:     '#ffffff',
}

const stripTags = (text) => text.replace(/<\/?\d+>/g, '')

// Styles récurrents
const EYEBROW = look('montserrat', 600, 11, '#db2777', { uppercase: true, letterSpacing: 0.2 })
const BUTTON  = look('montserrat', 600, 13, '#ffffff', { uppercase: true, letterSpacing: 0.08 })

export const HOME_GROUPS = [
  {
    title: 'Bandeau principal',
    desc: 'Le grand bloc tout en haut de la page d’accueil.',
    bg: BG.heroPink,
    toggle: { key: 'hero_stats_enabled', label: 'Afficher les deux chiffres clés sous les boutons' },
    fields: [
      { key: 'hero_eyebrow',       label: 'Petite ligne au-dessus du titre', rows: 1, look: EYEBROW, sample: hero.eyebrow },
      { key: 'hero_title',         label: 'Titre', rows: 2, look: look('vibes', 400, 80, '#1e1020', { lineHeight: 1.1 }), sample: stripTags(hero.title) },
      { key: 'hero_subtitle',      label: 'Sous-titre', rows: 2, look: look('cormorant', 400, 28, '#831843', { italic: true, lineHeight: 1.4 }), sample: hero.subtitle },
      { key: 'hero_desc',          label: 'Texte', rows: 3, look: look('cormorant', 400, 17, '#831843', { lineHeight: 1.7 }), sample: hero.desc },
      { key: 'hero_cta',           label: 'Bouton principal (vers la boutique)', rows: 1, kind: 'button', bg: BG.rose, look: BUTTON, sample: hero.cta },
      { key: 'hero_cta_secondary', label: 'Second bouton (vers les nouveautés)', rows: 1, kind: 'button',
        look: look('montserrat', 600, 13, '#1e1020', { uppercase: true, letterSpacing: 0.08 }), sample: hero.ctaKits },
      { key: 'hero_stat1_value',   label: 'Premier chiffre', rows: 1, look: look('cormorant', 600, 32, '#1e1020', { lineHeight: 1 }), sample: hero.stat1Value },
      { key: 'hero_stat1_label',   label: 'Légende du premier chiffre', rows: 1,
        look: look('montserrat', 500, 11, '#9d6480', { uppercase: true, letterSpacing: 0.1 }), sample: hero.stat1Label },
      { key: 'hero_stat2_value',   label: 'Second chiffre', rows: 1, look: look('cormorant', 600, 32, '#1e1020', { lineHeight: 1 }), sample: hero.stat2Value },
      { key: 'hero_stat2_label',   label: 'Légende du second chiffre', rows: 1,
        look: look('montserrat', 500, 11, '#9d6480', { uppercase: true, letterSpacing: 0.1 }), sample: hero.stat2Label },
    ],
  },
  {
    title: 'Bloc « Notre histoire »',
    desc: 'Le bloc avec la photo de fils, sous les coups de cœur.',
    bg: BG.rosePale,
    fields: [
      { key: 'crafts_eyebrow', label: 'Petite ligne au-dessus du titre', rows: 1, look: EYEBROW, sample: crafts.eyebrow },
      { key: 'crafts_title',   label: 'Titre', rows: 1, look: look('vibes', 400, 60, '#831843', { lineHeight: 1.1 }), sample: crafts.title },
      { key: 'crafts_text',    label: 'Texte', rows: 4, look: look('cormorant', 300, 17, '#9d6480', { lineHeight: 1.8 }), sample: crafts.text },
      { key: 'crafts_points',  label: 'Engagements', rows: 4, hint: 'Un engagement par ligne.',
        look: look('montserrat', 500, 13, '#1e1020'), sample: crafts.points.join('\n') },
      { key: 'crafts_cta',     label: 'Bouton (vers la page Notre Histoire)', rows: 1, kind: 'button', bg: BG.rose, look: BUTTON, sample: crafts.cta },
    ],
  },
  {
    title: 'Avantages',
    desc: 'Les trois arguments affichés côte à côte.',
    bg: BG.white,
    fields: [
      ['shipping', 'Premier'], ['payment', 'Deuxième'], ['packaging', 'Troisième'],
    ].flatMap(([key, rank], i) => [
      { key: `advantage_${i + 1}_title`, label: `${rank} avantage — titre`, rows: 1,
        look: look('montserrat', 600, 13, '#1e1020'), sample: advantages[key].title },
      { key: `advantage_${i + 1}_desc`,  label: `${rank} avantage — texte`, rows: 2,
        look: look('cormorant', 400, 14, '#9d6480', { italic: true, lineHeight: 1.5 }), sample: advantages[key].desc },
    ]),
  },
]

const PARAGRAPHS_HINT = 'Laissez une ligne vide entre deux paragraphes pour les séparer.'
const SECTION_TITLE = look('playfair', 700, 22, '#1e1020')
const PARAGRAPH = look('cormorant', 400, 19, '#9d6480', { lineHeight: 1.85 })
const YEAR = look('playfair', 700, 32, '#db2777', { align: 'center' })
const YEAR_TEXT = look('montserrat', 400, 13, '#9d6480', { lineHeight: 1.6, align: 'center' })

export const ABOUT_GROUPS = [
  {
    title: 'En-tête',
    desc: 'Titre et phrase d’accroche, en haut de la page.',
    bg: BG.aboutHero,
    fields: [
      { key: 'about_title',    label: 'Titre de la page', rows: 1,
        look: look('vibes', 400, 68, '#831843', { lineHeight: 1.1, align: 'center' }), sample: about.title },
      { key: 'about_subtitle', label: 'Phrase d’accroche', rows: 2,
        look: look('cormorant', 300, 19, '#9d6480', { italic: true, lineHeight: 1.7, align: 'center' }), sample: about.subtitle },
    ],
  },
  {
    title: 'Citation et texte principal',
    desc: 'La citation mise en avant, puis les deux parties du texte et la signature.',
    bg: BG.white,
    fields: [
      { key: 'about_quote', label: 'Citation mise en avant', rows: 3,
        look: look('vibes', 400, 32, '#db2777', { lineHeight: 1.5, align: 'center' }), sample: about.pullQuote },
      { key: 'about_who_title', label: 'Titre de la première partie', rows: 1, look: SECTION_TITLE, sample: about.whoTitle },
      { key: 'about_who', label: 'Première partie', rows: 8, hint: PARAGRAPHS_HINT, look: PARAGRAPH, sample: about.who1 },
      { key: 'about_mission_title', label: 'Titre de la seconde partie', rows: 1, look: SECTION_TITLE, sample: about.missionTitle },
      { key: 'about_mission', label: 'Seconde partie', rows: 6, hint: PARAGRAPHS_HINT, look: PARAGRAPH, sample: about.mission1 },
      { key: 'about_signature', label: 'Signature', rows: 1, hint: 'Le prénom affiché en fin de texte.',
        look: look('vibes', 400, 36, '#db2777'), sample: about.signature },
    ],
  },
  {
    title: 'Chronologie',
    desc: 'Les deux dates en bas de la page.',
    bg: BG.rosePale,
    fields: [
      { key: 'about_year_1',      label: 'Première date', rows: 1, look: YEAR, sample: '1995' },
      { key: 'about_year_1_text', label: 'Texte de la première date', rows: 2, look: YEAR_TEXT, sample: about.timeline1995 },
      { key: 'about_year_2',      label: 'Seconde date', rows: 1, look: YEAR, sample: '2026' },
      { key: 'about_year_2_text', label: 'Texte de la seconde date', rows: 2, look: YEAR_TEXT, sample: about.timeline2026 },
    ],
  },
]

// Corps des textes légaux (CGV.module.css — .sectionBody p)
const LEGAL_BODY = look('montserrat', 400, 14, '#374151', { lineHeight: 1.8 })
const LEGAL_SAMPLE = 'Les présentes conditions générales de vente régissent l’ensemble des relations contractuelles entre Au Point-Compté et toute personne effectuant un achat sur broderie.ch.'

export const LEGAL_GROUPS = [
  { title: 'Conditions générales de vente (CGV)', desc: 'Obligatoires et acceptées avant validation commande (CO suisse art. 40a).', bg: BG.white,
    fields: [{ key: 'cgv', label: 'Texte des CGV', path: '/cgv', rows: 8, look: LEGAL_BODY, sample: LEGAL_SAMPLE }] },
  { title: 'Mentions légales', desc: 'Identité de l’entreprise, numéro IDE, responsable éditorial.', bg: BG.white,
    fields: [{ key: 'mentions_legales', label: 'Texte des mentions légales', path: '/mentions-legales', rows: 8, look: LEGAL_BODY, sample: LEGAL_SAMPLE }] },
  { title: 'Politique de retour', desc: 'Délai de rétractation et modalités de renvoi (14 jours recommandés en Suisse).', bg: BG.white,
    fields: [{ key: 'politique_retour', label: 'Texte de la politique de retour', path: '/cgv', rows: 8, look: LEGAL_BODY, sample: LEGAL_SAMPLE }] },
]

// Bandeau d'annonce (AnnouncementBanner.module.css)
export const BANNER_FIELD = {
  key: 'banner_text',
  look: look('montserrat', 400, 13, '#ffffff', { lineHeight: 1.4, align: 'center' }),
  bg: BG.rose,
}

/* Texte de l'aperçu : la saisie si elle existe (premier paragraphe pour un
   long texte), sinon le texte actuellement affiché sur la boutique. */
export function previewSample(value, sample) {
  const text = typeof value === 'string' && value.trim() ? value.trim() : sample
  const first = (text ?? '').split(/\n\s*\n/)[0]
  return first.length > 320 ? `${first.slice(0, 320).trimEnd()}…` : first
}
