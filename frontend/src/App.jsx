import { useState } from 'react'
import {
  ShoppingBag, Heart, Search, User, ChevronRight,
  Star, MapPin, Phone, Mail,
  Package, Truck, RefreshCw, Shield
} from 'lucide-react'
import s from './App.module.css'

/* ── Données mockées ──────────────────────────────────── */

const CATEGORIES = [
  { id: 1, nom: 'Kits de broderie',     count: 48, bg: 'catBg1', icon: '🧵' },
  { id: 2, nom: 'Fils & Cotons',        count: 124, bg: 'catBg2', icon: '🎀' },
  { id: 3, nom: 'Toiles & Tissus',      count: 36, bg: 'catBg3', icon: '🪡' },
  { id: 4, nom: 'Cadres & Cerceaux',    count: 22, bg: 'catBg4', icon: '⭕' },
  { id: 5, nom: 'Accessoires',          count: 57, bg: 'catBg5', icon: '✂️' },
  { id: 6, nom: 'Livres & Patrons',     count: 31, bg: 'catBg6', icon: '📖' },
]

const PRODUITS = [
  { id: 1, nom: 'Kit "Jardin Alpin"',        prix: 'CHF 38.50', prixAncien: 'CHF 49.00', badge: 'Nouveauté', note: 5, avis: 42,  bg: 'catBg1', icon: '🌸' },
  { id: 2, nom: 'Fil DMC Mouliné — Rose Pâle', prix: 'CHF 3.90',  prixAncien: null,       badge: null,       note: 5, avis: 118, bg: 'catBg2', icon: '🎀' },
  { id: 3, nom: 'Cerceau en bois — 20 cm',   prix: 'CHF 8.50',  prixAncien: null,       badge: null,       note: 4, avis: 67,  bg: 'catBg4', icon: '⭕' },
  { id: 4, nom: 'Kit "Edelweiss Brodé"',      prix: 'CHF 42.00', prixAncien: 'CHF 55.00', badge: '-24%',    note: 5, avis: 89,  bg: 'catBg3', icon: '🌼' },
  { id: 5, nom: 'Toile Aida — Blanc Neige',  prix: 'CHF 12.90', prixAncien: null,       badge: null,       note: 4, avis: 33,  bg: 'catBg6', icon: '🪡' },
  { id: 6, nom: 'Kit Débutant "Montagne"',   prix: 'CHF 29.90', prixAncien: 'CHF 36.00', badge: 'Coup de ♡', note: 5, avis: 201, bg: 'catBg5', icon: '🏔️' },
  { id: 7, nom: 'Ciseaux Dorés — Stork',     prix: 'CHF 24.50', prixAncien: null,       badge: null,       note: 5, avis: 56,  bg: 'catBg2', icon: '✂️' },
  { id: 8, nom: 'Patron "Lac Léman"',        prix: 'CHF 7.90',  prixAncien: null,       badge: null,       note: 4, avis: 28,  bg: 'catBg7', icon: '💧' },
]

const TEMOIGNAGES = [
  {
    id: 1,
    texte: 'Une boutique exceptionnelle ! Les kits sont magnifiques, les fils d\'une qualité irréprochable. J\'ai reçu ma commande en 2 jours à Genève.',
    nom: 'Marie-Claire V.',
    lieu: 'Genève, GE',
    avatar: '👩',
    note: 5,
  },
  {
    id: 2,
    texte: 'Je broderie depuis 20 ans et c\'est la meilleure sélection de fils que j\'ai trouvée en Suisse. Le service client est tout simplement parfait.',
    nom: 'Heidi K.',
    lieu: 'Berne, BE',
    avatar: '👩‍🦱',
    note: 5,
  },
  {
    id: 3,
    texte: 'Le kit "Edelweiss Brodé" m\'a été offert pour Noël — j\'en suis tombée amoureuse. Les instructions sont claires, idéal pour débuter !',
    nom: 'Sophie M.',
    lieu: 'Lausanne, VD',
    avatar: '👱‍♀️',
    note: 5,
  },
]

const INSPO_TAGS = ['Point de croix', 'Broderie libre', 'Smocks', 'Hardanger', 'Ruban', 'Embroidery anglaise', 'Débutant', 'Expert']

const AVANTAGES = [
  { icon: <Truck size={22} />,    titre: 'Livraison rapide',   desc: '1–2 jours en Suisse via La Poste CH' },
  { icon: <RefreshCw size={22} />, titre: 'Retour 14 jours',   desc: 'Satisfaite ou remboursée, sans questions' },
  { icon: <Shield size={22} />,    titre: 'Paiement sécurisé', desc: 'Twint, carte, facture — 100% sécurisé' },
  { icon: <Package size={22} />,   titre: 'Emballage soigné',  desc: 'Chaque commande emballée avec amour' },
]

/* ── Étoiles ─────────────────────────────────────────── */
function Stars({ note }) {
  return (
    <div className={s.productStars} aria-label={`${note} étoiles sur 5`}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12} fill={i <= note ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

/* ── App ─────────────────────────────────────────────── */
export default function App() {
  const [activeTag, setActiveTag] = useState(0)
  const [wishlist, setWishlist]   = useState(new Set())
  const [cartCount] = useState(2)

  function toggleWishlist(id) {
    setWishlist(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <>
      {/* ── Bannière promo ── */}
      <div className={s.banner}>
        🇨🇭 Livraison rapide 1–2 jours · CHF 8.50 en Suisse
        <span>·</span>
        Nouveaux kits printemps disponibles
        <span>·</span>
        Paiement par Twint accepté
      </div>

      {/* ── Navbar ── */}
      <nav className={s.navbar}>
        <a href="#" className={s.navLogo} aria-label="Au Point-Compté — Accueil">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="15" stroke="#DB2777" strokeWidth="1.5" fill="#FDF2F8"/>
            <path d="M8 22 Q16 8 24 22" stroke="#DB2777" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <line x1="22" y1="10" x2="26" y2="14" stroke="#DB2777" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="22" cy="10" r="1.5" fill="#DB2777"/>
          </svg>
          <span className={s.navLogoText}>Au Point-Compté</span>
        </a>

        <ul className={s.navLinks} role="list">
          <li><a href="#categories">Collections</a></li>
          <li><a href="#produits">Boutique</a></li>
          <li><a href="#savoir-faire">Savoir-faire</a></li>
          <li><a href="#temoignages">Avis</a></li>
          <li><a href="#">Blog</a></li>
        </ul>

        <div className={s.navActions}>
          <button className={s.navIconBtn} aria-label="Rechercher">
            <Search size={20} />
          </button>
          <button className={s.navIconBtn} aria-label="Mon compte">
            <User size={20} />
          </button>
          <button className={s.navIconBtn} aria-label={`Panier — ${cartCount} articles`}>
            <ShoppingBag size={20} />
            {cartCount > 0 && <span className={s.cartBadge} aria-hidden="true">{cartCount}</span>}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={s.hero} aria-label="Bandeau principal">
        <div className={s.heroContent}>
          <p className={s.heroEyebrow}>Artisanat suisse depuis 1987</p>

          <h1 className={s.heroTitle}>L'art de la<br />broderie à l'aiguille</h1>

          <p className={s.heroSubtitle}>Kits, fils et accessoires<br />sélectionnés avec passion</p>

          <p className={s.heroDesc}>
            Découvrez notre collection de fils DMC, kits de broderie et accessoires
            de qualité suisse. Idéal pour les débutantes comme les expertes.
          </p>

          <div className={s.heroActions}>
            <button className={s.btnPrimary}>
              Découvrir la boutique
            </button>
            <button className={s.btnSecondary}>
              Nos kits du moment <ChevronRight size={16} />
            </button>
          </div>

          <div className={s.heroStats}>
            <div className={s.heroStat}>
              <strong>2 400+</strong>
              <span>Références en stock</span>
            </div>
            <div className={s.heroStat}>
              <strong>12 000+</strong>
              <span>Clientes satisfaites</span>
            </div>
            <div className={s.heroStat}>
              <strong>37 ans</strong>
              <span>De passion & d'expertise</span>
            </div>
          </div>
        </div>

        <div className={s.heroImageWrap} aria-hidden="true">
          <div style={{
            width: '100%', height: '100%', minHeight: '90vh',
            background: 'linear-gradient(160deg, #fce7f3 0%, #f9a8d4 35%, #fdf4ff 70%, #fff7ed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '180px',
          }}>
            🧵
          </div>
          <div className={s.heroImageOverlay} />
          <div className={s.heroDecorCard}>
            <div className={s.heroDecorDot}><Star size={18} fill="currentColor" /></div>
            <div>
              <span>Note clients</span>
              <small>4.9 / 5 — 3 200 avis</small>
            </div>
          </div>
        </div>
      </section>

      {/* ── Avantages ── */}
      <section style={{
        background: '#fff',
        borderTop: '1px solid var(--rose-border)',
        borderBottom: '1px solid var(--rose-border)',
        padding: '40px 80px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }}>
          {AVANTAGES.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--rose-pale)', border: '1px solid var(--rose-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--rose)', flexShrink: 0,
              }}>
                {a.icon}
              </div>
              <div>
                <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', marginBottom: 4 }}>{a.titre}</p>
                <p style={{ fontFamily: 'Cormorant Infant, serif', fontSize: 14, fontStyle: 'italic', color: 'var(--text-muted)' }}>{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Catégories ── */}
      <section className={`${s.section} ${s.sectionLight}`} id="categories">
        <div className={s.sectionHeader}>
          <p className={s.sectionEyebrow}>Explorez</p>
          <h2 className={s.sectionTitle}>Nos collections</h2>
          <p className={s.sectionDesc}>Du fil au patron, tout ce qu'il vous faut pour créer de belles œuvres brodées.</p>
        </div>

        <div className={s.categoriesGrid}>
          {CATEGORIES.map(cat => (
            <div key={cat.id} className={s.categoryCard} role="button" tabIndex={0} aria-label={`Catégorie : ${cat.nom}`}>
              <div className={`${s.categoryBg} ${s[cat.bg]}`} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
              <div className={s.catIllus} aria-hidden="true">{cat.icon}</div>
              <div className={s.categoryCardOverlay}>
                <p className={s.categoryName}>{cat.nom}</p>
                <p className={s.categoryCount}>{cat.count} articles</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bandeau inspiration ── */}
      <div className={s.inspoBar}>
        <p className={s.inspoBarTitle}>S'inspirer</p>
        <div className={s.inspoTags} role="list">
          {INSPO_TAGS.map((tag, i) => (
            <button
              key={i}
              className={`${s.inspoTag} ${activeTag === i ? s.inspoTagActive : ''}`}
              onClick={() => setActiveTag(i)}
              aria-pressed={activeTag === i}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Produits ── */}
      <section className={`${s.section} ${s.sectionPale}`} id="produits">
        <div className={s.sectionHeader}>
          <p className={s.sectionEyebrow}>Sélection</p>
          <h2 className={s.sectionTitle}>Coups de cœur</h2>
          <p className={s.sectionDesc}>Nos articles les plus appréciés, choisis avec soin par notre équipe.</p>
        </div>

        <div className={s.productsGrid}>
          {PRODUITS.map(p => (
            <article key={p.id} className={s.productCard} aria-label={p.nom}>
              <div className={s.productImageWrap}>
                <div className={`${s.productBg} ${s[p.bg]}`} aria-hidden="true">{p.icon}</div>

                {p.badge && <span className={s.productBadge}>{p.badge}</span>}

                <button
                  className={s.productWishlist}
                  onClick={() => toggleWishlist(p.id)}
                  aria-label={wishlist.has(p.id) ? `Retirer ${p.nom} de la liste de souhaits` : `Ajouter ${p.nom} à la liste de souhaits`}
                >
                  <Heart size={16} fill={wishlist.has(p.id) ? '#DB2777' : 'none'} color={wishlist.has(p.id) ? '#DB2777' : 'currentColor'} />
                </button>

                <button className={s.productAddBtn} aria-label={`Ajouter ${p.nom} au panier`}>
                  Ajouter au panier
                </button>
              </div>

              <div className={s.productInfo}>
                <p className={s.productBrand}>Au Point-Compté</p>
                <p className={s.productName}>{p.nom}</p>
                <div className={s.productFooter}>
                  <p className={s.productPrice}>
                    {p.prix}
                    {p.prixAncien && <span className={s.productPriceOld}>{p.prixAncien}</span>}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Stars note={p.note} />
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: 'var(--text-muted)' }}>({p.avis})</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <button className={s.btnPrimary}>Voir tous les produits</button>
        </div>
      </section>

      {/* ── Savoir-faire ── */}
      <section className={s.craftsGrid} id="savoir-faire" aria-label="Notre savoir-faire">
        <div className={s.craftsVisual} aria-hidden="true">
          <div className={s.craftsIllus}>🧵</div>
        </div>

        <div className={s.craftsContent}>
          <p className={s.sectionEyebrow} style={{ justifyContent: 'flex-start', marginBottom: 20 }}>
            <span style={{ marginRight: 0 }}>Notre histoire</span>
          </p>
          <h2 className={s.craftsTitle}>L'amour du fil<br />depuis 1987</h2>
          <p className={s.craftsText}>
            Fondée à Lausanne, Au Point-Compté est une boutique spécialisée dans les arts
            de l'aiguille. Depuis près de 40 ans, nous accompagnons les passionnées de broderie
            avec une sélection rigoureuse de matériel de qualité supérieure.
          </p>

          <ul className={s.craftsList} aria-label="Nos engagements">
            {[
              'Fils DMC certifiés, couleurs garanties',
              'Kits conçus par nos brodeuses expertes',
              'Conseils personnalisés par téléphone et email',
              'Livraison soignée depuis Lausanne, VD',
              'Conforme LPD — vos données restent en Suisse',
            ].map((item, i) => (
              <li key={i} className={s.craftsListItem}>{item}</li>
            ))}
          </ul>

          <button className={s.btnPrimary} style={{ alignSelf: 'flex-start' }}>
            Découvrir notre histoire
          </button>
        </div>
      </section>

      {/* ── Témoignages ── */}
      <section className={`${s.section} ${s.sectionPale}`} id="temoignages">
        <div className={s.sectionHeader}>
          <p className={s.sectionEyebrow}>Avis clients</p>
          <h2 className={s.sectionTitle}>Elles nous font confiance</h2>
          <p className={s.sectionDesc}>Plus de 3 200 avis vérifiés — note moyenne 4.9/5.</p>
        </div>

        <div className={s.testimonialsGrid}>
          {TEMOIGNAGES.map(t => (
            <blockquote key={t.id} className={s.testimonialCard}>
              <div className={s.testimonialQuote} aria-hidden="true">"</div>
              <div className={s.testimonialStars} aria-label={`${t.note} étoiles`}>
                {[1,2,3,4,5].map(i => <Star key={i} size={14} fill={i <= t.note ? 'currentColor' : 'none'} />)}
              </div>
              <p className={s.testimonialText}>{t.texte}</p>
              <footer className={s.testimonialAuthor}>
                <div className={s.testimonialAvatar} aria-hidden="true">{t.avatar}</div>
                <div>
                  <p className={s.testimonialName}>{t.nom}</p>
                  <p className={s.testimonialLocation}>
                    <MapPin size={10} style={{ display: 'inline', marginRight: 3 }} aria-hidden="true" />
                    {t.lieu}
                  </p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      {/* ── Newsletter ── */}
      <section className={s.newsletter} aria-label="Inscription à la newsletter">
        <h2 className={s.newsletterTitle}>Restez inspirée</h2>
        <p className={s.newsletterDesc}>Nouvelles collections, tutoriels exclusifs et offres réservées aux abonnées.</p>
        <form className={s.newsletterForm} onSubmit={e => e.preventDefault()} noValidate>
          <label htmlFor="newsletter-email" style={{ position: 'absolute', left: -9999 }}>Votre adresse email</label>
          <input
            id="newsletter-email"
            type="email"
            className={s.newsletterInput}
            placeholder="votre@email.ch"
            autoComplete="email"
          />
          <button type="submit" className={s.newsletterBtn}>S'abonner</button>
        </form>
      </section>

      {/* ── Footer ── */}
      <footer className={s.footer} role="contentinfo">
        <div className={s.footerGrid}>
          <div className={s.footerBrand}>
            <span className={s.footerLogoText}>Au Point-Compté</span>
            <p className={s.footerDesc}>
              Votre spécialiste suisse en broderie depuis 1987.
              Qualité, passion et service au fil de chaque commande.
            </p>
            <div className={s.footerSocials} aria-label="Réseaux sociaux">
              {/* Instagram */}
              <button className={s.footerSocialBtn} aria-label="Instagram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </button>
              {/* Facebook */}
              <button className={s.footerSocialBtn} aria-label="Facebook">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </button>
              {/* Pinterest */}
              <button className={s.footerSocialBtn} aria-label="Pinterest">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.172-4.97 1.172-4.97s-.299-.598-.299-1.482c0-1.388.806-2.428 1.808-2.428.852 0 1.265.64 1.265 1.408 0 .858-.546 2.141-.828 3.33-.236.995.499 1.806 1.476 1.806 1.772 0 3.137-1.868 3.137-4.561 0-2.385-1.715-4.052-4.161-4.052-2.835 0-4.498 2.126-4.498 4.324 0 .856.33 1.773.741 2.274a.3.3 0 0 1 .069.286c-.076.312-.244.995-.277 1.134-.044.183-.145.222-.334.134-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621.938.29 1.931.446 2.962.446 5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                </svg>
              </button>
            </div>
          </div>

          <div>
            <h3 className={s.footerColTitle}>Boutique</h3>
            <ul className={s.footerLinks} role="list">
              <li><a href="#">Kits de broderie</a></li>
              <li><a href="#">Fils & Cotons</a></li>
              <li><a href="#">Toiles & Tissus</a></li>
              <li><a href="#">Accessoires</a></li>
              <li><a href="#">Nouveautés</a></li>
              <li><a href="#">Promotions</a></li>
            </ul>
          </div>

          <div>
            <h3 className={s.footerColTitle}>Aide</h3>
            <ul className={s.footerLinks} role="list">
              <li><a href="#">Mon compte</a></li>
              <li><a href="#">Suivi de commande</a></li>
              <li><a href="#">Livraison & retours</a></li>
              <li><a href="#">FAQ</a></li>
              <li><a href="#">CGV</a></li>
              <li><a href="#">Politique de confidentialité</a></li>
            </ul>
          </div>

          <div>
            <h3 className={s.footerColTitle}>Contact</h3>
            <div className={s.footerContact}>
              <div className={s.footerContactItem}>
                <MapPin size={14} className={s.footerContactIcon} aria-hidden="true" />
                <span>Rue du Simplon 12<br />1006 Lausanne, VD</span>
              </div>
              <div className={s.footerContactItem}>
                <Phone size={14} className={s.footerContactIcon} aria-hidden="true" />
                <span>+41 21 601 XX XX</span>
              </div>
              <div className={s.footerContactItem}>
                <Mail size={14} className={s.footerContactIcon} aria-hidden="true" />
                <span>contact@aupointcompte.ch</span>
              </div>
            </div>
          </div>
        </div>

        <div className={s.footerBottom}>
          <p className={s.footerBottomLeft}>
            © 2026 Au Point-Compté — Lausanne, Suisse 🇨🇭 &nbsp;·&nbsp; Hébergé par Infomaniak
          </p>
          <div className={s.footerPayments} aria-label="Moyens de paiement acceptés">
            <span className={s.paymentBadge}>TWINT</span>
            <span className={s.paymentBadge}>VISA</span>
            <span className={s.paymentBadge}>MC</span>
            <span className={s.paymentBadge}>POSTFINANCE</span>
          </div>
        </div>
      </footer>
    </>
  )
}
