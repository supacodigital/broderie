import { useTranslation } from "react-i18next";
import { ChevronRight, Star } from "lucide-react";
import { Link } from "react-router-dom";
import s from "./HeroSection.module.css";

export default function HeroSection() {
  const { t } = useTranslation();

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

      {/* ── Visuel ── */}
      <div className={s.visual} aria-hidden="true">
        <img
          src="/heroo.webp"
          alt=""
          className={s.visualImg}
          width="800"
          height="900"
          loading="eager"
          fetchPriority="high"
        />
        <div className={s.visualOverlay} />
        <div className={s.ratingCard}>
          <div className={s.ratingDot}>
            <Star size={18} fill="currentColor" />
          </div>
          <div>
            <span>{t("hero.ratingLabel")}</span>
            <small>4.9 / 5 — 3 200 avis</small>
          </div>
        </div>
      </div>
    </section>
  );
}
