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
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { getOrders } from "../../services/orders.service.js";
import { getReviews } from "../../services/reviews.service.js";
import { getProducts } from "../../services/products.service.js";
import s from "./AdminLayout.module.css";

/* Construit les items nav avec badges dynamiques */
function buildNavMain(pendingOrders, pendingReviews) {
  return [
    { to: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
    {
      to: "/commandes",
      icon: ShoppingCart,
      label: "Commandes",
      badge: pendingOrders || null,
    },
    { to: "/produits", icon: Package, label: "Produits" },
    { to: "/clients", icon: Users, label: "Clients" },
    {
      to: "/avis",
      icon: MessageSquare,
      label: "Avis",
      badge: pendingReviews || null,
    },
  ];
}

const NAV_TOOLS = [
  { to: "/fournisseurs", icon: Truck, label: "Fournisseurs" },
  { to: "/fidelite", icon: Heart, label: "Fidélité" },
  { to: "/categories", icon: Tag, label: "Catégories" },
  { to: "/coupons",     icon: Ticket,   label: "Promotions"  },
  { to: "/newsletter",  icon: Mail,     label: "Newsletter"  },
  { to: "/parametres",  icon: Settings, label: "Paramètres"  },
];

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
  "/fidelite": "Fidélité",
  "/categories": "Catégories",
  "/coupons": "Promotions",
  "/parametres": "Paramètres",
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

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${s.navLink} ${isActive ? s.active : ""}`}
    >
      <Icon size={16} />
      <span className={s.navLabel}>{label}</span>
      {badge ? <span className={s.navBadge}>{badge}</span> : null}
    </NavLink>
  );
}

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [lowStock, setLowStock] = useState(0);

  const pageTitle = useBreadcrumb();

  /* Charge les compteurs de badges + stock critique :
     - au montage,
     - toutes les 60s (filet de sécurité),
     - immédiatement quand une page admin signale une mutation (event « admin:data-changed »),
       ce qui rafraîchit le badge dès qu'on change le statut d'une commande, modère un avis, etc. */
  useEffect(() => {
    let cancelled = false;
    async function fetchBadges() {
      try {
        const [ordersRes, reviewsRes, stockRes] = await Promise.all([
          getOrders({ status: "pending,awaiting_payment", limit: 1 }),
          getReviews({ approved: false, limit: 1 }),
          getProducts({ low_stock: true, limit: 1 }),
        ]);
        if (cancelled) return;
        setPendingOrders(ordersRes.pagination?.total ?? 0);
        setPendingReviews(reviewsRes.pagination?.total ?? 0);
        setLowStock(stockRes.pagination?.total ?? 0);
      } catch {
        /* silencieux — pas bloquant */
      }
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 60_000);
    window.addEventListener("admin:data-changed", fetchBadges);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("admin:data-changed", fetchBadges);
    };
  }, []);

  const NAV_MAIN = buildNavMain(pendingOrders, pendingReviews);

  /* Construit les notifications dynamiques */
  const notifications = [
    pendingOrders > 0 && {
      icon: ShoppingCart,
      title: `${pendingOrders} commande${pendingOrders > 1 ? "s" : ""} en attente`,
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

  const handleLogout = async () => {
    await logout();
    navigate("/connexion", { replace: true });
  };

  return (
    <div className={s.shell}>
      {open && <div className={s.overlay} onClick={() => setOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`${s.sidebar} ${open ? s.sidebarOpen : ""}`}>
        {/* Logo */}
        <div className={s.brand}>
          <p className={s.brandName}>Au Point-Compté</p>
          <p className={s.brandSub}>Administration</p>
          <button
            className={s.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className={s.nav}>
          <div className={s.navSection}>
            <span className={s.navSectionLabel}>Menu</span>
            {NAV_MAIN.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
          <div className={s.navSection}>
            <span className={s.navSectionLabel}>Outils</span>
            {NAV_TOOLS.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
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
            <p className={s.userRole}>
              {user?.role === "super_admin" ? "Super Admin" : "Administratrice"}
            </p>
          </div>
          <button
            className={s.logoutBtn}
            onClick={handleLogout}
            title="Déconnexion"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── Zone principale ── */}
      <div className={s.main}>
        {/* Header */}
        <header className={s.header}>
          <button
            className={s.menuBtn}
            onClick={() => setOpen(true)}
            aria-label="Menu"
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
              href={import.meta.env.VITE_SHOP_URL ?? '/'}
              target="_blank"
              rel="noopener noreferrer"
              className={s.boutiquBtn}
            >
              <Eye size={14} />
              <span>Voir la boutique</span>
            </a>

            {/* Cloche notifications */}
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
          </div>
        </header>

        <main className={s.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
