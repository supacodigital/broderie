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
          <span className={s.logoText}>Au Point-Compté</span>
          <p className={s.desc}>{t("footer.desc")}</p>
          <div className={s.socials} aria-label="Réseaux sociaux">
            <a
              href="#"
              className={s.socialBtn}
              aria-label="Instagram"
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
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            <a
              href="#"
              className={s.socialBtn}
              aria-label="Facebook"
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
            <a
              href="#"
              className={s.socialBtn}
              aria-label="Pinterest"
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
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.172-4.97 1.172-4.97s-.299-.598-.299-1.482c0-1.388.806-2.428 1.808-2.428.852 0 1.265.64 1.265 1.408 0 .858-.546 2.141-.828 3.33-.236.995.499 1.806 1.476 1.806 1.772 0 3.137-1.868 3.137-4.561 0-2.385-1.715-4.052-4.161-4.052-2.835 0-4.498 2.126-4.498 4.324 0 .856.33 1.773.741 2.274a.3.3 0 0 1 .069.286c-.076.312-.244.995-.277 1.134-.044.183-.145.222-.334.134-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621.938.29 1.931.446 2.962.446 5.523 0 10-4.477 10-10S17.523 2 12 2z" />
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
              <Link to="/catalogue?featured=true">
                {t("footer.shopLinks.new")}
              </Link>
            </li>
            <li>
              <Link to="/catalogue?promo=true">
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
              <Link to="/mon-compte">{t("footer.helpLinks.tracking")}</Link>
            </li>
            <li>
              <Link to="/faq">{t("footer.helpLinks.faq")}</Link>
            </li>
            <li>
              <Link to="/cgv">{t("footer.helpLinks.cgv")}</Link>
            </li>
            <li>
              <Link to="/mentions-legales">{t("footer.helpLinks.legal")}</Link>
            </li>
            <li>
              <Link to="/politique-de-retour">
                {t("footer.helpLinks.returns")}
              </Link>
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
                Rue du Simplon 12
                <br />
                1006 Lausanne, VD
              </span>
            </div>
            <div className={s.contactItem}>
              <Phone size={14} className={s.contactIcon} aria-hidden="true" />
              <a href="tel:+41216010000">+41 21 601 XX XX</a>
            </div>
            <div className={s.contactItem}>
              <Mail size={14} className={s.contactIcon} aria-hidden="true" />
              <a href="mailto:contact@aupointcompte.ch">
                contact@aupointcompte.ch
              </a>
            </div>
          </address>
        </div>
      </div>

      {/* ── Bas de page ── */}
      <div className={s.bottom}>
        <p className={s.copyright}>{t("footer.copyright")}</p>
        <div className={s.payments} aria-label="Moyens de paiement acceptés">
          <span className={s.payBadge}>TWINT</span>
          <span className={s.payBadge}>VISA</span>
          <span className={s.payBadge}>MC</span>
          <span className={s.payBadge}>POSTFINANCE</span>
        </div>
      </div>
    </footer>
  );
}
