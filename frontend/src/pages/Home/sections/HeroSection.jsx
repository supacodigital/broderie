import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Star, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import s from "./HeroSection.module.css";

export default function HeroSection() {
  const { t } = useTranslation();
  const visualRef = useRef(null);

  /* Parallax doux : on met à jour une variable CSS --scroll selon le scroll */
  useEffect(() => {
    const el = visualRef.current;
    if (!el) return;

    /* Respect du prefers-reduced-motion — désactive le parallax */
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        /* Borne le scroll pour limiter le déplacement parallax (max 220px) */
        const value = Math.min(window.scrollY, 600);
        el.style.setProperty("--scroll", `${value}px`);
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className={s.hero} aria-label="Bandeau principal">
      {/* ── Contenu texte ── */}
      <div className={s.content}>
        <p className={s.eyebrow}>{t("hero.eyebrow")}</p>

        <h1 className={s.title}>{t("hero.title")}</h1>

        <p className={s.subtitle}>{t("hero.subtitle")}</p>

        <p className={s.desc}>{t("hero.desc")}</p>

        <div className={s.actions}>
          <Link to="/catalogue" className={s.btnPrimary}>
            {t("hero.cta")}
          </Link>
          <Link to="/catalogue?badge=nouveaute" className={s.btnSecondary}>
            {t("hero.ctaKits")} <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className={s.stats}>
          <div className={s.stat}>
            <strong>{t("hero.stat1Value")}</strong>
            <span>{t("hero.stat1Label")}</span>
          </div>
          <div className={s.stat}>
            <strong>{t("hero.stat2Value")}</strong>
            <span>{t("hero.stat2Label")}</span>
          </div>
          <div className={s.stat}>
            <strong>{t("hero.stat3Value")}</strong>
            <span>{t("hero.stat3Label")}</span>
          </div>
        </div>
      </div>

      {/* ── Mosaïque visuelle animée ── */}
      <div className={s.visual} ref={visualRef} aria-hidden="true">
        {/* Cercle décoratif en fond */}
        <div className={s.bgCircle} />
        <div className={s.bgRing} />

        {/* Carte note clients — en haut à gauche */}
        <div className={`${s.floatCard} ${s.ratingCard}`}>
          <div className={s.ratingDot}>
            <Star size={16} fill="currentColor" />
          </div>
          <div>
            <span>{t("hero.ratingLabel")}</span>
            <small>{t("hero.ratingDetail")}</small>
          </div>
        </div>

        {/* Image principale */}
        <div className={s.mainImageWrap}>
          <img
            src="/heroo.webp"
            alt=""
            className={s.mainImage}
            width="800"
            height="900"
            loading="eager"
            fetchPriority="high"
          />
          <div className={s.mainImageGloss} />
        </div>

        {/* Carte Made in CH — en bas à droite */}
        <div className={`${s.floatCard} ${s.swissCard}`}>
          <div className={s.swissFlag} aria-hidden="true">
            <MapPin size={14} />
          </div>
          <div>
            <span>{t("hero.badgeSwiss")} 🇨🇭</span>
            <small>{t("hero.badgeSwissPlace")}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
