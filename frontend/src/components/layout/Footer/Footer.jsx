import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Phone, Mail } from "lucide-react";
import s from "./Footer.module.css";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className={s.footer} role="contentinfo">
      <div className={s.grid}>
        {/* ── Marque ── */}
        <div className={s.brand}>
          <img
            src="/logo.png"
            alt="Au Point-Compté"
            className={s.logoImg}
            width="220"
            height="66"
          />
          <p className={s.desc}>{t("footer.desc")}</p>
          <div className={s.socials} aria-label="Réseaux sociaux">
            <a
              href="https://www.facebook.com/aupointcompte/?locale=fr_FR"
              className={s.socialBtn}
              aria-label="Facebook"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </a>
          </div>
        </div>

        {/* ── Boutique ── */}
        <div>
          <h3 className={s.colTitle}>{t("footer.shopTitle")}</h3>
          <ul className={s.links} role="list">
            <li>
              <Link to="/catalogue?category=kits">
                {t("footer.shopLinks.kits")}
              </Link>
            </li>
            <li>
              <Link to="/catalogue?category=fils">
                {t("footer.shopLinks.fils")}
              </Link>
            </li>
            <li>
              <Link to="/catalogue?category=toiles">
                {t("footer.shopLinks.toiles")}
              </Link>
            </li>
            <li>
              <Link to="/catalogue?category=accessoires">
                {t("footer.shopLinks.accessories")}
              </Link>
            </li>
            <li>
              <Link to="/catalogue?badge=nouveaute">
                {t("footer.shopLinks.new")}
              </Link>
            </li>
            <li>
              <Link to="/catalogue?badge=promo">
                {t("footer.shopLinks.promo")}
              </Link>
            </li>
          </ul>
        </div>

        {/* ── Aide ── */}
        <div>
          <h3 className={s.colTitle}>{t("footer.helpTitle")}</h3>
          <ul className={s.links} role="list">
            <li>
              <Link to="/mon-compte">{t("footer.helpLinks.account")}</Link>
            </li>
            <li>
              <Link to="/mon-compte?tab=orders">
                {t("footer.helpLinks.tracking")}
              </Link>
            </li>
            <li>
              <Link to="/contact">{t("footer.helpLinks.faq")}</Link>
            </li>
            <li>
              <Link to="/cgv">{t("footer.helpLinks.cgv")}</Link>
            </li>
            <li>
              <Link to="/mentions-legales">{t("footer.helpLinks.legal")}</Link>
            </li>
          </ul>
        </div>

        {/* ── Contact ── */}
        <div>
          <h3 className={s.colTitle}>{t("footer.contactTitle")}</h3>
          <address className={s.contact}>
            <div className={s.contactItem}>
              <MapPin size={14} className={s.contactIcon} aria-hidden="true" />
              <span>
                Rue de Vuarrengel 10
                <br />
                1418 Vuarrens, Suisse
              </span>
            </div>
            <div className={s.contactItem}>
              <Phone size={14} className={s.contactIcon} aria-hidden="true" />
              <a href="tel:+41216010000">+41 79 847 01 26</a>
            </div>
            <div className={s.contactItem}>
              <Mail size={14} className={s.contactIcon} aria-hidden="true" />
              <a href="mailto:julie@broderie.ch">julie@broderie.ch</a>
            </div>
          </address>
        </div>
      </div>

      {/* ── Bas de page ── */}
      <div className={s.bottom}>
        <p className={s.copyright}>{t("footer.copyright")}</p>
        <p className={s.credit}>
          Site réalisé par{" "}
          <a
            href="https://supaco-digital.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            supacodigital
          </a>
        </p>
      </div>
    </footer>
  );
}
