import { Trans, useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useHomeContent } from "../../../hooks/useHomeContent.js";
import s from "./HeroSection.module.css";

export default function HeroSection() {
  const { t } = useTranslation();
  // Textes modifiables depuis Paramètres → Page d'accueil (ADM-08)
  const { text, isCustom, content } = useHomeContent();
  const showStats = content.hero_stats_enabled !== "0";

  return (
    <section className={s.hero} aria-label="Bandeau principal">
      {/* ── Contenu texte ── */}
      <div className={s.content}>
        <p className={s.eyebrow}>{text("hero_eyebrow", t("hero.eyebrow"))}</p>

        {/* Titre saisi dans l'admin : affiché tel quel. Titre d'origine : le mot
            mis en valeur garde sa couleur d'accent. */}
        <h1 className={s.title}>
          {isCustom("hero_title")
            ? text("hero_title")
            : <Trans i18nKey="hero.title" components={{ 1: <span className={s.titleAccent} /> }} />}
        </h1>

        <p className={s.subtitle}>{text("hero_subtitle", t("hero.subtitle"))}</p>

        <p className={s.desc}>{text("hero_desc", t("hero.desc"))}</p>

        <div className={s.actions}>
          <Link to="/catalogue" className={s.btnPrimary}>
            {text("hero_cta", t("hero.cta"))}
          </Link>
          <Link to="/catalogue?sort=created_at&order=desc" className={s.btnSecondary}>
            {text("hero_cta_secondary", t("hero.ctaKits"))} <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>

        {showStats && (
          <div className={s.stats}>
            <div className={s.stat}>
              <strong>{text("hero_stat1_value", t("hero.stat1Value"))}</strong>
              <span>{text("hero_stat1_label", t("hero.stat1Label"))}</span>
            </div>
            <div className={s.stat}>
              <strong>{text("hero_stat2_value", t("hero.stat2Value"))}</strong>
              <span>{text("hero_stat2_label", t("hero.stat2Label"))}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
