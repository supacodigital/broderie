import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ExternalLink, Eye } from 'lucide-react'
// Polices de la boutique, pour l'aperçu de la mise en forme (chargées par cette page seulement)
import '@shop-fonts'
import {
  getHomeContent, updateHomeContent, getAboutContent, updateAboutContent,
  getLegalContent, updateLegalContent,
} from '../../services/content.service.js'
import ContentOverview from './ContentOverview.jsx'
import FieldsEditor from './FieldsEditor.jsx'
import BannerEditor from './BannerEditor.jsx'
import EmailsEditor from './EmailsEditor.jsx'
import LivePreview from '../../components/LivePreview/LivePreview.jsx'
import { sectionBySlug, HOME_GROUPS, ABOUT_GROUPS, LEGAL_GROUPS } from './contentSections.js'
import s from './Content.module.css'

const SHOP_URL = import.meta.env.VITE_SHOP_URL ?? ''

const KEEP_NOTE = 'Un champ laissé vide garde le texte actuellement affiché sur la boutique. Sous chaque texte, « Mise en forme » règle sa police, sa taille, sa couleur et son alignement.'

/* Aperçu en direct : ouvert ou fermé, retenu d'une visite à l'autre. En
   dessous de cette largeur, il recouvre l'éditeur : on ne l'ouvre qu'à la demande. */
const PREVIEW_KEY = 'admin.contentPreview'
const NARROW_SCREEN = '(max-width: 1099px)'
const isNarrow = () => window.matchMedia?.(NARROW_SCREEN).matches ?? false

const readPreviewOpen = () => {
  try { return !isNarrow() && localStorage.getItem(PREVIEW_KEY) === '1' } catch { return false }
}

/* `live` : { onDraft, onFocusText, shopPath } — l'éditeur publie son brouillon
   et le texte en cours d'édition pour l'aperçu en direct. */
function editorFor(page, live) {
  switch (page) {
    case 'home':
      return <FieldsEditor groups={HOME_GROUPS} load={getHomeContent} save={updateHomeContent}
        note={KEEP_NOTE} saveLabel="Enregistrer la page d’accueil" {...live} />
    case 'about':
      return <FieldsEditor groups={ABOUT_GROUPS} load={getAboutContent} save={updateAboutContent}
        note={KEEP_NOTE} saveLabel="Enregistrer la page" {...live} />
    case 'legal':
      return <FieldsEditor groups={LEGAL_GROUPS} load={getLegalContent} save={updateLegalContent}
        note="Ces textes sont affichés sur la boutique et dans les e-mails de confirmation ; ils doivent être validés par un juriste. Un champ vide garde le texte d’origine de la boutique. La mise en forme ne s’applique qu’à la boutique : les e-mails gardent leur présentation."
        saveLabel="Enregistrer tous les textes" {...live} />
    case 'banner':
      return <BannerEditor {...live} />
    case 'emails':
      return <EmailsEditor />
    default:
      return null
  }
}

/* Une page de contenu : son éditeur et, à côté, l'aperçu en direct.
   Remontée à chaque changement de page (key) : brouillon et texte en cours
   d'édition repartent de zéro. */
function SectionEditor({ section, previewOpen, onClosePreview }) {
  const [draft, setDraft] = useState(undefined)
  const [focus, setFocus] = useState(null)
  const live = { onDraft: setDraft, onFocusText: setFocus, shopPath: section.shopPath }

  return (
    <div className={s.workspace}>
      <div className={s.editor}>{editorFor(section.page, live)}</div>
      {previewOpen && (
        <LivePreview path={section.shopPath} page={section.page} draft={draft} focus={focus} onClose={onClosePreview} />
      )}
    </div>
  )
}

/* Espace « Contenu du site » du super-administrateur : un tableau de bord,
   puis une page par contenu (accueil, Notre Histoire, bandeau, textes légaux,
   e-mails), chacune accessible depuis le menu. */
export default function Content() {
  const { section } = useParams()
  const [previewOpen, setPreviewOpen] = useState(readPreviewOpen)
  const current = section ? sectionBySlug(section) : null
  if (section && !current) return <Navigate to="/contenu" replace />

  // Les e-mails ne s'affichent pas sur la boutique : pas d'aperçu
  const canPreview = Boolean(current?.shopPath)
  const showPreview = canPreview && previewOpen

  const togglePreview = (open) => {
    setPreviewOpen(open)
    try { if (!isNarrow()) localStorage.setItem(PREVIEW_KEY, open ? '1' : '0') } catch { /* préférence non retenue */ }
  }

  return (
    <div className={`${s.page} ${showPreview ? s.withPreview : ''}`}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>{current ? current.label : 'Contenu du site'}</h1>
          <p className={s.pageDesc}>
            {current
              ? current.desc
              : 'Les textes de la boutique et leur mise en forme. Chaque modification est visible sur la boutique dès l’enregistrement.'}
          </p>
        </div>
        {canPreview && (
          <div className={s.headActions}>
            <button
              type="button"
              className={showPreview ? s.btnPrimary : s.btnGhost}
              aria-pressed={showPreview}
              onClick={() => togglePreview(!showPreview)}
            >
              <Eye size={14} aria-hidden="true" /> Aperçu en direct
            </button>
            <a href={`${SHOP_URL}${current.shopPath}`} target="_blank" rel="noopener noreferrer" className={s.btnGhost}>
              <ExternalLink size={14} aria-hidden="true" /> Voir sur la boutique
            </a>
          </div>
        )}
      </div>

      {/* key : chaque page repart de zéro (chargement, modifications en cours) */}
      {current
        ? <SectionEditor key={current.slug} section={current} previewOpen={showPreview} onClosePreview={() => togglePreview(false)} />
        : <ContentOverview />}
    </div>
  )
}
