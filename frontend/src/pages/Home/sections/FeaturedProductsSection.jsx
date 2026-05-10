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
      limit: 8,
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
          <div className={s.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={s.skeleton} aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className={s.grid}>
            {products.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                index={i}
                wishlisted={wishlist.has(product.id)}
                onWishlist={toggleWishlist}
              />
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
