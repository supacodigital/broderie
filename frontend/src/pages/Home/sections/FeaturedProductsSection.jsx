import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getProducts } from "../../../services/products.service.js";
import { useWishlist } from "../../../contexts/WishlistContext.jsx";
import { normalizeLocale } from "../../../utils/locale.js";
import ProductCard from "../../../components/ui/ProductCard/ProductCard.jsx";
import s from "./FeaturedProductsSection.module.css";

export default function FeaturedProductsSection() {
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { ids: wishlist, toggle: toggleWishlist } = useWishlist();

  useEffect(() => {
    let cancelled = false;
    getProducts({
      featured: true,
      limit: 5,
      sort: 'updated_at',
      order: 'desc',
      locale: normalizeLocale(i18n.language),
    })
      .then((res) => {
        if (!cancelled) {
          setProducts(res.data ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  return (
    <section className={s.section}>
      <div className={s.inner}>
        <div className={s.header}>
          <p className={s.eyebrow}>{t("products.eyebrow")}</p>
          <h2 className={s.title}>{t("products.title")}</h2>
          <p className={s.desc}>{t("products.desc")}</p>
        </div>

        {loading ? (
          <div className={s.bento}>
            <div className={`${s.skeleton} ${s.skeletonLarge}`} aria-hidden="true" />
            <div className={s.skeleton} aria-hidden="true" />
            <div className={s.skeleton} aria-hidden="true" />
            <div className={s.skeleton} aria-hidden="true" />
            <div className={s.skeleton} aria-hidden="true" />
          </div>
        ) : (
          <div className={s.bento}>
            {products.map((product, i) => (
              <div key={product.id} className={i === 0 ? s.bentoLarge : s.bentoSmall}>
                <ProductCard
                  product={product}
                  index={i}
                  wishlisted={wishlist.has(product.id)}
                  onWishlist={toggleWishlist}
                  featured={i === 0}
                />
              </div>
            ))}
          </div>
        )}

        <div className={s.cta}>
          <Link to="/catalogue" className={s.ctaBtn}>
            {t("products.viewAll")}
          </Link>
        </div>
      </div>
    </section>
  );
}
