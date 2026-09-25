import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, ShoppingBag, Star, Truck, Shield, ChevronDown, ChevronUp, Gift } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getLoyaltyTiers } from '../../services/loyalty.service.js'
import { roundCHF } from '../../utils/chf.js'
import s from './ProductInfo.module.css'

/* Calcule la TVA à afficher selon le taux snapshot */
function formatTVA(priceChf, taxRate) {
  if (!taxRate) return null
  const ttc  = roundCHF(priceChf)
  const ht   = roundCHF(ttc / (1 + taxRate / 100))
  const tva  = roundCHF(ttc - ht)
  return { ttc, ht, tva, rate: taxRate }
}

function Stars({ rating, count }) {
  const r = parseFloat(rating) || 0
  return (
    <div className={s.starsRow}>
      <div className={s.stars} aria-label={`${r} étoiles sur 5`}>
        {[1,2,3,4,5].map(i => (
          <Star key={i} size={14} fill={i <= Math.round(r) ? 'currentColor' : 'none'} />
        ))}
      </div>
      <span className={s.starsCount}>{r.toFixed(1)} ({count} avis)</span>
    </div>
  )
}

export default function ProductInfo({ product, onAddToCart, wishlisted, onWishlist }) {
  const { t } = useTranslation()

  const [selectedVariant, setSelectedVariant] = useState(null)
  /* Vente à la coupe (trames, bandes à broder) : `qty` compte des tronçons de
     10 cm et non des pièces — c'est la convention du backend, qui permet de ne
     pas ajouter de colonne de longueur au panier (voir utils/length.utils.js).
     L'affichage, lui, reste en centimètres : c'est ce que la cliente mesure. */
  const soldByLength = !!product.sold_by_length
  const stepCm       = Number(product.length_step_cm) || 10
  const minCm        = Number(product.length_min_cm)  || 50
  const minQty       = Math.ceil(minCm / stepCm)

  const [qty,             setQty]             = useState(soldByLength ? minQty : 1)
  /* Texte du champ de longueur, distinct de `qty` : pendant la frappe la valeur
     peut être vide ou invalide (« 4 » avant « 40 »). On ne la convertit qu'à la
     validation, sinon le champ se corrigerait sous les doigts de la cliente. */
  const [lengthInput,     setLengthInput]     = useState(String((soldByLength ? minQty : 1) * (Number(product.length_step_cm) || 10)))
  const [detailsOpen,     setDetailsOpen]     = useState(false)
  const [addedFeedback,   setAddedFeedback]   = useState(false)
  /* Existence d'un programme de fidélité — `false` par défaut : en cas d'échec de
     l'appel, mieux vaut ne rien annoncer que promettre une récompense incertaine. */
  const [hasLoyalty,      setHasLoyalty]      = useState(false)

  useEffect(() => {
    let cancelled = false
    getLoyaltyTiers()
      .then(tiers => { if (!cancelled) setHasLoyalty((tiers ?? []).length > 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const variants    = product.variants ?? []
  const hasVariants = variants.length > 0

  /* Groupe les variantes par leur attribut "name" (ex: "Couleur", "Taille") */
  const variantGroups = hasVariants
    ? variants.reduce((acc, v) => {
        if (!acc[v.name]) acc[v.name] = []
        acc[v.name].push(v)
        return acc
      }, {})
    : {}

  const effectivePrice = selectedVariant
    ? roundCHF(product.price_chf + (selectedVariant.price_modifier ?? 0))
    : roundCHF(product.price_chf)

  /* Produit sur commande : fabriqué à la demande, commande possible sans stock (délai 3 à 4 semaines) */
  const isMadeToOrder = !!product.is_made_to_order
  const rawStockQty = selectedVariant ? selectedVariant.stock : (product.stock ?? 99)
  /* Pour un produit sur commande, on ne limite pas la quantité par le stock.
     Vente à la coupe : `stock` compte des CENTIMÈTRES (ADM-12) et `qty` des
     tronçons de 10 cm — 1 m (100) en stock autorise donc 10 tronçons. */
  const stockQty = isMadeToOrder
    ? 999
    : (soldByLength ? Math.floor(rawStockQty / stepCm) : rawStockQty)
  const outOfStock = !isMadeToOrder && rawStockQty === 0

  const tva = formatTVA(effectivePrice, product.tax_rate ?? 8.1)

  /* Valide la longueur saisie : arrondit au pas de découpe, applique le minimum
     et borne au stock disponible. Appelé à la sortie du champ (ou sur Entrée),
     jamais pendant la frappe. */
  function commitLength() {
    const saisi = parseInt(lengthInput, 10)
    if (!Number.isFinite(saisi) || saisi <= 0) {
      // Champ vidé : on revient au minimum plutôt que de laisser un état vide
      setQty(minQty)
      setLengthInput(String(minQty * stepCm))
      return
    }
    // Arrondi au pas le plus proche : 55 cm devient 60 cm, pas 50
    const troncons = Math.max(minQty, Math.min(stockQty, Math.round(saisi / stepCm)))
    setQty(troncons)
    setLengthInput(String(troncons * stepCm))
  }

  /* Les boutons − / + restent utilisables pour un ajustement fin : ils doivent
     donc écrire dans le champ, sinon l'affichage et la quantité divergeraient. */
  function stepLength(delta) {
    setQty(q => {
      const next = Math.max(minQty, Math.min(stockQty, q + delta))
      setLengthInput(String(next * stepCm))
      return next
    })
  }

  function handleAdd() {
    if (outOfStock) return
    onAddToCart?.({ product, variant: selectedVariant, qty })
    setAddedFeedback(true)
    setTimeout(() => setAddedFeedback(false), 2000)
  }

  return (
    <div className={s.info}>
      {/* ── Fil d'Ariane catégorie ── */}
      {product.category_name && (
        <p className={s.category}>{product.category_name}</p>
      )}

      {/* ── Nom ── */}
      <h1 className={s.title}>{product.name}</h1>

      {/* ── Description ── */}
      {product.description && (
        <div className={s.descBlock}>
          <p className={s.desc}>{product.description}</p>
        </div>
      )}

      {/* ── Dimensions ── */}
      {(product.length_cm || product.width_cm) && (
        <p className={s.dimensions}>
          Dimensions : {[
            product.length_cm ? `${parseFloat(product.length_cm)} cm (L)` : null,
            product.width_cm ? `${parseFloat(product.width_cm)} cm (l)` : null,
          ].filter(Boolean).join(' × ')}
        </p>
      )}

      {/* ── SKU ── */}
      {product.sku && (
        <p className={s.sku}>Réf. {product.sku}</p>
      )}

      {/* ── Notes ── */}
      {product.avg_rating != null && (
        <Stars rating={product.avg_rating} count={product.review_count ?? 0} />
      )}

      {/* ── Prix ── */}
      <div className={s.priceBlock}>
        <span className={s.price}>CHF {effectivePrice.toFixed(2)}</span>
        {product.compare_price_chf && (
          <span className={s.priceOld}>CHF {roundCHF(product.compare_price_chf).toFixed(2)}</span>
        )}
        {product.compare_price_chf && (
          <span className={s.discount}>
            -{Math.round((1 - product.price_chf / product.compare_price_chf) * 100)}%
          </span>
        )}
        {/* Sans cette mention, « CHF 16.50 » laisse croire au prix de l'article
            entier alors qu'il s'agit du prix au mètre. */}
        {soldByLength && <span className={s.perMeter}>/ mètre</span>}
      </div>

      {/* Prix de la longueur choisie — la cliente ne doit pas avoir à calculer
          16.50 × 0.6 de tête pour savoir ce qu'elle va payer. */}
      {soldByLength && (
        <p className={s.lengthTotal}>
          {qty * stepCm} cm — <strong>CHF {roundCHF(effectivePrice * qty * stepCm / 100).toFixed(2)}</strong>
          <span className={s.lengthHint}>
            minimum {minCm} cm, par tranches de {stepCm} cm
          </span>
        </p>
      )}

      {/* ── Détail TVA — obligatoire légalement ── */}
      {tva && (
        <p className={s.tvaLine}>
          Prix TTC · TVA {tva.rate}% incluse (CHF {tva.tva.toFixed(2)})
        </p>
      )}

      {/* ── Variantes ── */}
      {hasVariants && Object.entries(variantGroups).map(([groupName, opts]) => (
        <div key={groupName} className={s.variantGroup}>
          <p className={s.variantLabel}>
            {groupName}
            {selectedVariant?.name === groupName && (
              <span className={s.variantSelected}> — {selectedVariant.value}</span>
            )}
          </p>
          <div className={s.variantOptions}>
            {opts.map(v => (
              <button
                key={v.id}
                className={`${s.variantBtn} ${selectedVariant?.id === v.id ? s.variantBtnActive : ''} ${v.stock === 0 ? s.variantBtnOut : ''}`}
                onClick={() => setSelectedVariant(v.id === selectedVariant?.id ? null : v)}
                disabled={v.stock === 0}
                aria-pressed={selectedVariant?.id === v.id}
                title={v.stock === 0 ? 'Épuisé' : v.value}
              >
                {v.value}
                {parseFloat(v.price_modifier) > 0 && <span className={s.variantMod}>+{parseFloat(v.price_modifier).toFixed(2)}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* ── Quantité + Panier ── */}
      <div className={s.addRow}>
        <div className={s.qtyWrap}>
          <button
            className={s.qtyBtn}
            onClick={() => soldByLength ? stepLength(-1) : setQty(q => Math.max(1, q - 1))}
            aria-label={soldByLength ? 'Diminuer la longueur' : 'Diminuer la quantité'}
            disabled={qty <= (soldByLength ? minQty : 1)}
          >−</button>
          {soldByLength ? (
            /* Saisie directe : commander 2 m au bouton « + » demanderait quinze
               clics. Le champ accepte une longueur libre en cm ; l'arrondi au
               pas et le respect du minimum se font à la validation (onBlur),
               pour ne pas corriger la saisie sous les doigts de la cliente. */
            <span className={s.qtyInputWrap}>
              <input
                type="text"
                inputMode="numeric"
                className={s.qtyInput}
                value={lengthInput}
                onChange={(e) => setLengthInput(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitLength}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                aria-label="Longueur en centimètres"
              />
              <span className={s.qtyUnit}>cm</span>
            </span>
          ) : (
            <span className={s.qtyValue} aria-live="polite">{qty}</span>
          )}
          <button
            className={s.qtyBtn}
            onClick={() => soldByLength ? stepLength(1) : setQty(q => Math.min(stockQty, q + 1))}
            aria-label={soldByLength ? 'Augmenter la longueur' : 'Augmenter la quantité'}
            disabled={qty >= stockQty || outOfStock}
          >+</button>
        </div>

        <button
          className={`${s.addBtn} ${addedFeedback ? s.addBtnSuccess : ''}`}
          onClick={handleAdd}
          disabled={outOfStock || (hasVariants && !selectedVariant)}
          aria-label={outOfStock ? 'Épuisé' : t('products.addToCart')}
        >
          <ShoppingBag size={16} aria-hidden="true" />
          {addedFeedback
            ? '✓ Ajouté !'
            : outOfStock
              ? 'Épuisé'
              : t('products.addToCart')}
        </button>

        <button
          className={`${s.wishlistBtn} ${wishlisted ? s.wishlistBtnActive : ''}`}
          onClick={() => onWishlist?.(product.id)}
          aria-label={wishlisted ? t('products.removeWishlist', { name: product.name }) : t('products.addWishlist', { name: product.name })}
        >
          <Heart size={18} fill={wishlisted ? '#DB2777' : 'none'} />
        </button>
      </div>

      {/* ── Programme de fidélité ──
           Affiché seulement si au moins un palier est actif : sans cette condition,
           la mention promettait une récompense sur CHAQUE fiche produit même quand
           aucun palier n'existe, et renvoyait vers un onglet de compte vide. */}
      {hasLoyalty && (
        <Link to="/mon-compte/profil" className={s.loyaltyHint}>
          <Gift size={14} className={s.loyaltyIcon} aria-hidden="true" />
          <span>
            Cet achat vous rapporte{' '}
            <strong>CHF {effectivePrice.toFixed(2)}</strong>{' '}
            dans votre programme de fidélité
          </span>
        </Link>
      )}

      {/* ── Stock ── */}
      {/* Produit sur commande : on masque le stock et on affiche le badge de délai à la place */}
      {isMadeToOrder ? (
        <p className={s.madeToOrder}>
          {product.made_to_order_delay_min_weeks && product.made_to_order_delay_max_weeks
            ? t('products.madeToOrderRange', {
                min: product.made_to_order_delay_min_weeks,
                max: product.made_to_order_delay_max_weeks,
              })
            : t('products.madeToOrder')}
        </p>
      ) : (
        <>
          {stockQty > 5 && (
            <p className={s.inStock}>
              ✓ En stock ({soldByLength ? `${stockQty * stepCm} cm` : stockQty})
            </p>
          )}
          {stockQty <= 5 && stockQty > 0 && (
            <p className={s.stockWarning}>⚠ Plus que {stockQty} en stock</p>
          )}
          {outOfStock && (
            <p className={s.outOfStock}>Épuisé — revenez bientôt</p>
          )}
        </>
      )}

      {/* ── Réassurance ── */}
      <div className={s.reassurance}>
        <div className={s.reassuranceItem}>
          <Truck size={14} aria-hidden="true" />
          <span>{t('advantages.shipping.title')} — {t('advantages.shipping.desc')}</span>
        </div>
        <div className={s.reassuranceItem}>
          <Shield size={14} aria-hidden="true" />
          <span>{t('advantages.payment.title')} — {t('advantages.payment.desc')}</span>
        </div>
      </div>

      {/* ── Détails accordéon ── */}
      {product.details && (
        <div className={s.accordion}>
          <button
            className={s.accordionBtn}
            onClick={() => setDetailsOpen(o => !o)}
            aria-expanded={detailsOpen}
          >
            <span>{t('product.details')}</span>
            {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {detailsOpen && (
            <div className={s.accordionContent}>
              <p>{product.details}</p>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
