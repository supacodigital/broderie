import { useState, useEffect, useRef } from "react";
import {
  Outlet,
  NavLink,
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  MessageSquare,
  Truck,
  Heart,
  Tag,
  Ticket,
  Mail,
  Settings,
  LogOut,
  Menu,
  X,
  Eye,
  Bell,
  AlertTriangle,
  Star,
  ChevronRight,
  Receipt,
  ClipboardList,
  House,
  BookOpen,
  Megaphone,
  FileText,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useUnsavedChanges } from "../../contexts/UnsavedChangesContext.jsx";
import {
  SETTINGS_TABS,
  resolveSettingsTab,
  settingsTabPath,
} from "../../pages/Settings/settingsTabs.js";
import { getOrders } from "../../services/orders.service.js";
import { getReviews } from "../../services/reviews.service.js";
import { getProducts } from "../../services/products.service.js";
import s from "./AdminLayout.module.css";

/* Menu de l'administratrice, groupé par usage (26.09) : le tableau de bord
   seul en haut, puis ventes, catalogue et marketing. Les badges sont
   dynamiques. */
function buildAdminSections(newOrders, pendingReviews) {
  return [
    {
      items: [
        { to: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
      ],
    },
    {
      label: "Ventes",
      items: [
        {
          to: "/commandes",
          icon: ShoppingCart,
          label: "Commandes",
          badge: newOrders || null,
        },
        // Suivi des factures QR payées / à payer / en retard (ADM-09)
        { to: "/factures", icon: Receipt, label: "Factures" },
        { to: "/clients", icon: Users, label: "Clients" },
        {
          to: "/avis",
          icon: MessageSquare,
          label: "Avis",
          badge: pendingReviews || null,
        },
      ],
    },
    {
      label: "Catalogue",
      items: [
        { to: "/produits", icon: Package, label: "Produits" },
        { to: "/categories", icon: Tag, label: "Catégories" },
        { to: "/fournisseurs", icon: Truck, label: "Fournisseurs" },
        // Ce qu'il faut commander chez chaque fournisseur (ADM-09)
        { to: "/reassort", icon: ClipboardList, label: "Réassort" },
      ],
    },
    {
      label: "Marketing",
      items: [
        { to: "/coupons", icon: Ticket, label: "Promotions" },
        { to: "/fidelite", icon: Heart, label: "Fidélité" },
        { to: "/newsletter", icon: Mail, label: "Newsletter" },
      ],
    },
  ];
}

/* Menu du super-administrateur : le contenu du site, et son compte — rien
   d'autre (ni commandes, ni clientes, ni catalogue : 26.09). */
const NAV_CONTENT_SECTIONS = [
  {
    items: [
      { to: "/contenu", icon: LayoutDashboard, label: "Tableau de bord", end: true },
    ],
  },
  {
    label: "Contenu du site",
    items: [
      { to: "/contenu/accueil", icon: House, label: "Page d’accueil" },
      { to: "/contenu/notre-histoire", icon: BookOpen, label: "Notre Histoire" },
      { to: "/contenu/bandeau", icon: Megaphone, label: "Bandeau d’annonce" },
      { to: "/contenu/textes-legaux", icon: FileText, label: "Textes légaux" },
      { to: "/contenu/e-mails", icon: Mail, label: "E-mails" },
    ],
  },
];

const NAV_CONTENT_FOOTER = [
  { to: "/compte", icon: ShieldCheck, label: "Mon compte" },
];

/* Menu replié en icônes : choix mémorisé dans ce navigateur. Le stockage peut
   être indisponible (navigation privée) — le menu reste alors déplié. */
const COLLAPSED_KEY = "admin.sidebarCollapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(value) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    /* sans stockage, le choix vaut pour la session en cours */
  }
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Bonne matinée";
  if (h < 18) return "Bonne journée";
  return "Bonne soirée";
}

function greetingEmoji() {
  const h = new Date().getHours();
  if (h < 12) return "☀️";
  if (h < 18) return "👋";
  return "🌙";
}

function formatHeaderDate() {
  const d = new Date();
  const day = d.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/* Correspondance chemin → titre de page */
const ROUTE_LABELS = {
  "/dashboard": "Tableau de bord",
  "/commandes": "Commandes",
  "/produits": "Produits",
  "/clients": "Clients",
  "/avis": "Avis clients",
  "/fournisseurs": "Fournisseurs",
  "/factures": "Factures",
  "/reassort": "Réassort",
  "/fidelite": "Fidélité",
  "/categories": "Catégories",
  "/coupons": "Promotions",
  "/newsletter": "Newsletter",
  "/parametres": "Paramètres",
  "/contenu": "Contenu du site",
  "/compte": "Mon compte",
};

function useBreadcrumb() {
  const location = useLocation();
  /* Retire le basename /admin et extrait le premier segment */
  const seg =
    "/" +
    (location.pathname
      .replace(/^\/admin/, "")
      .split("/")
      .filter(Boolean)[0] ?? "dashboard");
  return ROUTE_LABELS[seg] ?? "Administration";
}

/* Panneau notifications */
function NotifPanel({ items, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div className={s.notifPanel} ref={panelRef}>
      <div className={s.notifPanelHeader}>
        <span>Notifications</span>
        <button className={s.notifPanelClose} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {items.length === 0 ? (
        <p className={s.notifEmpty}>Aucune notification</p>
      ) : (
        <ul className={s.notifList}>
          {items.map((n, i) => (
            <li key={i} className={s.notifItem}>
              <span className={s.notifIcon}>
                <n.icon size={14} />
              </span>
              <div className={s.notifText}>
                <p className={s.notifTitle}>{n.title}</p>
                {n.sub && <p className={s.notifSub}>{n.sub}</p>}
              </div>
              {n.to && (
                <Link to={n.to} className={s.notifLink} onClick={onClose}>
                  <ChevronRight size={14} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Clic sur un lien du menu. onNavigate : referme le tiroir sur mobile — sans
   lui, le menu restait ouvert par-dessus la page choisie.
   Modifications non enregistrées : confirmation avant de quitter la page.
   Un clic avec Cmd/Ctrl (nouvel onglet) ne quitte rien, il passe tel quel ;
   un clic sur la page déjà ouverte non plus (confirmer aurait effacé
   l'avertissement alors que la saisie restait à l'écran). */
function useGuardedClick(to, onNavigate) {
  const { dirty, guard } = useUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();

  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!dirty || to === location.pathname + location.search) {
      onNavigate();
      return;
    }
    e.preventDefault();
    guard(() => {
      onNavigate();
      navigate(to);
    });
  };
}

/* hintProps : info-bulle du menu replié */
function NavItem({ to, icon: Icon, label, badge, end, onNavigate, hintProps }) {
  const onClick = useGuardedClick(to, onNavigate);

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      {...hintProps}
      className={({ isActive }) => `${s.navLink} ${isActive ? s.active : ""}`}
    >
      <Icon size={16} />
      <span className={s.navLabel}>{label}</span>
      {badge ? <span className={s.navBadge}>{badge}</span> : null}
    </NavLink>
  );
}

/* Lien vers un onglet des paramètres. Tous partagent le chemin /parametres :
   l'onglet ouvert se lit dans l'URL, NavLink ne saurait pas le distinguer. */
function SettingsTabLink({ tab, current, className, onNavigate }) {
  const to = settingsTabPath(tab.key);
  const onClick = useGuardedClick(to, onNavigate);

  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`${className} ${current ? s.active : ""}`}
    >
      {tab.label}
    </Link>
  );
}

/* Largeur « ordinateur » : le menu replié en icônes n'existe qu'au-delà */
const DESKTOP_QUERY = "(min-width: 901px)";

function useIsDesktop() {
  const [matches, setMatches] = useState(
    () => window.matchMedia?.(DESKTOP_QUERY).matches ?? true,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(DESKTOP_QUERY);
    if (!mql) return;
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return matches;
}

/* Fait défiler le menu juste assez pour montrer `el` en entier ; plus haut
   que la zone visible, c'est son début qui reste à l'écran. */
function revealInNav(el) {
  const scroller = el.closest("[data-nav-scroll]");
  if (!scroller) return;
  const box = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  let delta = 0;
  if (box.bottom > view.bottom) delta = box.bottom - view.bottom + 8;
  if (box.top - delta < view.top) delta = box.top - view.top - 8;
  if (!delta) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
}

/* « Paramètres » : les onglets se choisissent depuis le menu (26.09).
   Menu déplié : liste qui se déroule sous le bouton, ouverte d'office sur la
   page Paramètres. Menu replié en icônes : petit menu flottant à droite de
   l'engrenage, fermé au clic ailleurs, avec Échap ou quand le menu défile. */
function SettingsNav({ collapsed, onNavigate, hintProps, onFlyoutOpen }) {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const iconMode = collapsed && isDesktop;
  const onSettings = location.pathname === "/parametres";
  const currentTab = onSettings
    ? resolveSettingsTab(new URLSearchParams(location.search).get("onglet"))
    : null;

  /* Liste ouverte en arrivant sur la page, refermée en la quittant */
  const [listOpen, setListOpen] = useState(onSettings);
  const [wasOnSettings, setWasOnSettings] = useState(onSettings);
  if (onSettings !== wasOnSettings) {
    setWasOnSettings(onSettings);
    setListOpen(onSettings);
  }

  const wrapRef = useRef(null);

  /* Paramètres est en fin de menu : une fois ouverte, la liste peut tomber
     sous le pli. Le menu défile jusqu'à elle — tout de suite, puis une fois
     déroulée (≈ 200 ms) ; sans animation, le premier appel suffit. */
  useEffect(() => {
    if (!listOpen || iconMode) return;
    const reveal = () => wrapRef.current && revealInNav(wrapRef.current);
    reveal();
    const timer = setTimeout(reveal, 220);
    return () => clearTimeout(timer);
  }, [listOpen, iconMode]);

  const [flyout, setFlyout] = useState(null);
  const triggerRef = useRef(null);
  const flyoutRef = useRef(null);
  // Menu déplié entre-temps (bouton, largeur d'écran) : le menu flottant n'a plus lieu d'être
  if (flyout && !iconMode) setFlyout(null);

  useEffect(() => {
    if (!flyout) return;
    function onMouseDown(e) {
      if (flyoutRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setFlyout(null);
    }
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setFlyout(null);
      triggerRef.current?.focus();
    }
    // Menu ou page qui défile : le menu flottant resterait décroché de l'engrenage
    function onScroll() {
      setFlyout(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    // Au clavier, on poursuit directement dans la liste, sur l'onglet ouvert
    const links = flyoutRef.current?.querySelectorAll("a");
    const target =
      flyoutRef.current?.querySelector('[aria-current="page"]') ?? links?.[0];
    target?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [flyout]);

  const onTriggerClick = (e) => {
    if (!iconMode) {
      setListOpen((v) => !v);
      return;
    }
    if (flyout) {
      setFlyout(null);
      return;
    }
    /* Ancré en bas sur l'engrenage : il est au pied du menu, la liste
       s'ouvre vers le haut */
    const trigger = e.currentTarget.getBoundingClientRect();
    const aside = e.currentTarget.closest("aside").getBoundingClientRect();
    setFlyout({ left: aside.right + 8, bottom: window.innerHeight - trigger.bottom });
    onFlyoutOpen();
  };

  const closeAndNavigate = () => {
    setFlyout(null);
    onNavigate();
  };

  /* Page Paramètres ouverte mais onglets invisibles (liste refermée, menu
     replié) : c'est le bouton qui porte le repère de la page active */
  const triggerActive = onSettings && (iconMode || !listOpen);
  const expanded = iconMode ? Boolean(flyout) : listOpen;

  return (
    <div ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${s.navLink} ${s.settingsTrigger} ${
          triggerActive ? s.active : onSettings ? s.settingsTriggerCurrent : ""
        }`}
        onClick={onTriggerClick}
        aria-expanded={expanded}
        aria-controls={iconMode ? "settings-flyout" : "settings-tabs"}
        {...(iconMode && !flyout ? hintProps : undefined)}
      >
        <Settings size={16} />
        <span className={s.navLabel}>Paramètres</span>
        {!iconMode && (
          <ChevronDown
            size={14}
            className={`${s.chevron} ${listOpen ? s.chevronOpen : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {!iconMode && (
        <div
          id="settings-tabs"
          className={`${s.subList} ${listOpen ? s.subListOpen : ""}`}
          inert={!listOpen}
        >
          <div className={s.subListInner}>
            <div className={s.subItems}>
              {SETTINGS_TABS.map((tab) => (
                <SettingsTabLink
                  key={tab.key}
                  tab={tab}
                  current={tab.key === currentTab}
                  className={s.subLink}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {flyout && (
        <div
          id="settings-flyout"
          ref={flyoutRef}
          className={s.flyout}
          style={{ left: flyout.left, bottom: flyout.bottom }}
          role="group"
          aria-label="Paramètres"
        >
          <p className={s.flyoutTitle} aria-hidden="true">Paramètres</p>
          {SETTINGS_TABS.map((tab) => (
            <SettingsTabLink
              key={tab.key}
              tab={tab}
              current={tab.key === currentTab}
              className={s.flyoutLink}
              onNavigate={closeAndNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function initials(first, last) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export default function AdminLayout() {
  const { user, logout, isSuperAdmin } = useAuth();
  const { guard } = useUnsavedChanges();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [hint, setHint] = useState(null);
  const asideRef = useRef(null);
  const menuBtnRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [newOrders, setNewOrders] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [lowStock, setLowStock] = useState(0);

  const pageTitle = useBreadcrumb();

  /* Charge les compteurs de badges + stock critique :
     - au montage,
     - toutes les 15s (filet de sécurité — nouvelle commande d'un client non signalée par un event),
     - dès que l'onglet regagne le focus/la visibilité (retour depuis un autre onglet/app),
     - immédiatement quand une page admin signale une mutation (event « admin:data-changed »),
       ce qui rafraîchit le badge dès qu'on change le statut d'une commande, modère un avis, etc. */
  useEffect(() => {
    // Le super-administrateur n'a ni commandes, ni avis, ni stock à surveiller
    if (isSuperAdmin) return;
    let cancelled = false;
    async function fetchBadges() {
      try {
        const [ordersRes, reviewsRes, stockRes] = await Promise.all([
          /* Nouvelles commandes : jamais ouvertes par l'admin connectée. Une
             commande en sort dès qu'elle ouvre sa page. Les paiements carte /
             Twint non aboutis n'y figurent pas (CLI-07). */
          getOrders({ unseen: 1, limit: 1 }),
          getReviews({ approved: false, limit: 1 }),
          getProducts({ low_stock: true, limit: 1 }),
        ]);
        if (cancelled) return;
        setNewOrders(ordersRes.pagination?.total ?? 0);
        setPendingReviews(reviewsRes.pagination?.total ?? 0);
        setLowStock(stockRes.pagination?.total ?? 0);
      } catch {
        /* silencieux — pas bloquant */
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") fetchBadges();
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 15_000);
    window.addEventListener("admin:data-changed", fetchBadges);
    window.addEventListener("focus", fetchBadges);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("admin:data-changed", fetchBadges);
      window.removeEventListener("focus", fetchBadges);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isSuperAdmin]);

  /* Tiroir mobile : Échap le referme et rend le focus au bouton « Menu » */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuBtnRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const sections = isSuperAdmin
    ? NAV_CONTENT_SECTIONS
    : buildAdminSections(newOrders, pendingReviews);

  const closeDrawer = () => {
    setOpen(false);
    setHint(null);
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed(next);
    setHint(null);
  };

  /* Info-bulle posée à droite du menu, à hauteur de l'élément survolé */
  const hideHint = () => setHint(null);
  const hintFor = (label) => ({
    onMouseEnter: (e) => showHint(e, label),
    onFocus: (e) => showHint(e, label),
    onMouseLeave: hideHint,
    onBlur: hideHint,
  });
  function showHint(e, label) {
    const target = e.currentTarget.getBoundingClientRect();
    const aside = asideRef.current.getBoundingClientRect();
    setHint({ label, top: target.top + target.height / 2, left: aside.right + 8 });
  }

  /* Construit les notifications dynamiques */
  const notifications = [
    newOrders > 0 && {
      icon: ShoppingCart,
      title: newOrders > 1 ? `${newOrders} nouvelles commandes` : "1 nouvelle commande",
      to: "/commandes",
    },
    pendingReviews > 0 && {
      icon: Star,
      title: `${pendingReviews} avis${pendingReviews > 1 ? "s" : ""} à modérer`,
      to: "/avis",
    },
    lowStock > 0 && {
      icon: AlertTriangle,
      title: `${lowStock} produit${lowStock > 1 ? "s" : ""} en stock critique`,
      sub: "Stock ≤ 5 unités",
      to: "/produits",
    },
  ].filter(Boolean);

  const hasNotif = notifications.length > 0;

  const handleLogout = () => guard(async () => {
    await logout();
    navigate("/connexion", { replace: true });
  });

  return (
    <div className={`${s.shell} ${collapsed ? s.collapsed : ""}`}>
      {open && <div className={s.overlay} onClick={closeDrawer} />}

      {/* ── Sidebar ── */}
      <aside
        ref={asideRef}
        id="admin-sidebar"
        className={`${s.sidebar} ${open ? s.sidebarOpen : ""}`}
      >
        {/* Logo */}
        <div className={s.brand}>
          <img
            src="/admin/logo.png"
            alt="Au Point-Compté"
            className={s.brandLogo}
            width={120}
            height={60}
          />
          <button
            className={s.closeBtn}
            onClick={closeDrawer}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
          <button
            className={s.collapseBtn}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Agrandir le menu" : "Réduire le menu"}
            {...hintFor(collapsed ? "Agrandir le menu" : "Réduire le menu")}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Navigation — groupes qui défilent, Paramètres en dernier (sa liste
            d'onglets défile avec le reste : épinglée en pied, elle écrasait
            le menu). Super-administrateur : Mon compte en pied. */}
        <nav className={s.nav} aria-label="Menu principal">
          <div className={s.navScroll} onScroll={hideHint} data-nav-scroll>
            {sections.map((section, i) => (
              <div key={section.label ?? i} className={s.navSection}>
                {section.label && (
                  <span className={s.navSectionLabel}>{section.label}</span>
                )}
                {section.items.map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    onNavigate={closeDrawer}
                    hintProps={collapsed ? hintFor(item.label) : undefined}
                  />
                ))}
              </div>
            ))}
            {!isSuperAdmin && (
              <div className={`${s.navSection} ${s.navSectionSettings}`}>
                <SettingsNav
                  collapsed={collapsed}
                  onNavigate={closeDrawer}
                  hintProps={hintFor("Paramètres")}
                  onFlyoutOpen={hideHint}
                />
              </div>
            )}
          </div>
          {isSuperAdmin && (
            <div className={s.navFooter}>
              {NAV_CONTENT_FOOTER.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  onNavigate={closeDrawer}
                  hintProps={collapsed ? hintFor(item.label) : undefined}
                />
              ))}
            </div>
          )}
        </nav>

        {/* Profil utilisateur */}
        <div className={s.userSection}>
          <div className={s.userAvatar}>
            {initials(user?.firstName, user?.lastName)}
          </div>
          <div className={s.userMeta}>
            <p className={s.userName}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className={s.userRole}>{user?.role === 'super_admin' ? 'Super-administratrice' : 'Administratrice'}</p>
          </div>
          <button
            className={s.logoutBtn}
            onClick={handleLogout}
            aria-label="Déconnexion"
            {...hintFor("Déconnexion")}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {hint && (
        <div
          className={s.hint}
          style={{ top: hint.top, left: hint.left }}
          aria-hidden="true"
        >
          {hint.label}
        </div>
      )}

      {/* ── Zone principale ── */}
      <div className={s.main}>
        {/* Header */}
        <header className={s.header}>
          <button
            ref={menuBtnRef}
            className={s.menuBtn}
            onClick={() => setOpen(true)}
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="admin-sidebar"
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb + greeting */}
          <div className={s.headerLeft}>
            <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
              <span className={s.breadcrumbRoot}>Admin</span>
              <ChevronRight size={13} className={s.breadcrumbSep} />
              <span className={s.breadcrumbCurrent}>{pageTitle}</span>
            </nav>
            <p className={s.greeting}>
              {formatHeaderDate()} — {greetingText()},{" "}
              {user?.firstName ?? "Admin"} {greetingEmoji()}
            </p>
          </div>

          <div className={s.headerRight}>
            <a
              href={import.meta.env.VITE_SHOP_URL ?? "/"}
              target="_blank"
              rel="noopener noreferrer"
              className={s.boutiquBtn}
            >
              <Eye size={14} />
              <span>Voir la boutique</span>
            </a>

            {/* Cloche notifications — commandes, avis, stock : sans objet pour le super-administrateur */}
            {!isSuperAdmin && (
            <div className={s.notifWrap}>
              <button
                className={s.notifBtn}
                aria-label="Notifications"
                onClick={() => setNotifOpen((v) => !v)}
              >
                <Bell size={18} />
                {hasNotif && <span className={s.notifDot} />}
              </button>
              {notifOpen && (
                <NotifPanel
                  items={notifications}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>
            )}
          </div>
        </header>

        <main className={s.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
