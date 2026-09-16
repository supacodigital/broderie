import { memo } from 'react'
import { roundCHF } from '../../../utils/chf.js'
import { highlightMatches } from './highlightMatches.js'
import s from './SearchSuggestion.module.css'

/* Une suggestion de la barre de recherche.
   Partagée par la recherche du catalogue et celle de la navbar : sans ce composant
   commun, le prix promotionnel et l'état du stock devaient être répétés à trois
   endroits, et divergeaient déjà de l'affichage des fiches produit. */
function SearchSuggestion({ product, query, showCategory = false }) {
  /* Produit sur commande : commandable sans stock — même règle que ProductCard,
     sinon 83 % du catalogue s'afficherait « épuisé » à tort. */
  const isMadeToOrder = !!product.is_made_to_order
  const isOutOfStock  = !isMadeToOrder && product.stock === 0
  const isLowStock    = !isMadeToOrder && product.stock > 0 && product.stock <= 5
  const hasPromo      = !!product.compare_price_chf

  return (
    <>
      <div className={s.image}>
        {product.image_url
          ? <img src={product.image_url} alt="" width="44" height="44" loading="lazy" />
          : <span aria-hidden="true">🧵</span>
        }
      </div>

      <div className={s.info}>
        <span className={s.name}>
          {highlightMatches(product.name, query).map((seg, i) => (
            seg.match
              ? <mark key={i} className={s.mark}>{seg.text}</mark>
              : <span key={i}>{seg.text}</span>
          ))}
        </span>

        <span className={s.meta}>
          {showCategory && product.category_name && (
            <span className={s.category}>{product.category_name}</span>
          )}
          {isOutOfStock && <span className={s.stockOut}>Épuisé</span>}
          {isLowStock   && <span className={s.stockLow}>Plus que {product.stock} en stock</span>}
          {isMadeToOrder && product.stock === 0 && (
            <span className={s.madeToOrder}>Sur commande</span>
          )}
        </span>
      </div>

      <span className={s.prices}>
        {hasPromo && (
          <span className={s.priceOld}>CHF {roundCHF(product.compare_price_chf).toFixed(2)}</span>
        )}
        <span className={hasPromo ? s.pricePromo : s.price}>
          CHF {roundCHF(product.price_chf).toFixed(2)}
        </span>
      </span>
    </>
  )
}

export default memo(SearchSuggestion)
