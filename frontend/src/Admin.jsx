import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Tag,
  BarChart2,
  Settings,
  LogOut,
  Bell,
  Plus,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Eye,
  Edit2,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Truck,
  Star,
  MessageSquare,
  Percent,
} from "lucide-react";
import s from "./Admin.module.css";

/* ── Données mockées ──────────────────────────────────── */

const COMMANDES = [
  {
    id: "#2847",
    client: "Marie-Claire V.",
    email: "mc.vidal@email.ch",
    montant: "CHF 87.40",
    statut: "paid",
    statusLabel: "Payée",
    date: "Aujourd'hui 09:14",
  },
  {
    id: "#2846",
    client: "Heidi Koller",
    email: "h.koller@bluewin.ch",
    montant: "CHF 42.00",
    statut: "shipped",
    statusLabel: "Expédiée",
    date: "Aujourd'hui 08:32",
  },
  {
    id: "#2845",
    client: "Juju Maillard",
    email: "s.mail@gmail.com",
    montant: "CHF 124.90",
    statut: "paid",
    statusLabel: "Payée",
    date: "Hier 17:55",
  },
  {
    id: "#2844",
    client: "Anna Brunner",
    email: "anna.b@sunrise.ch",
    montant: "CHF 29.90",
    statut: "pending",
    statusLabel: "En attente",
    date: "Hier 14:20",
  },
  {
    id: "#2843",
    client: "Céline Rochat",
    email: "c.rochat@vtx.ch",
    montant: "CHF 56.50",
    statut: "shipped",
    statusLabel: "Expédiée",
    date: "Hier 11:07",
  },
  {
    id: "#2842",
    client: "Laura Fontana",
    email: "laura.f@gmail.com",
    montant: "CHF 18.80",
    statut: "refunded",
    statusLabel: "Remboursée",
    date: "26 avr.",
  },
];

const ACTIVITE = [
  {
    type: "order",
    icon: <ShoppingBag size={14} />,
    dot: "activityDotRose",
    text: (
      <>
        <strong>Nouvelle commande #2847</strong> — Marie-Claire V. — CHF 87.40
      </>
    ),
    time: "Il y a 12 min",
  },
  {
    type: "stock",
    icon: <AlertTriangle size={14} />,
    dot: "activityDotGold",
    text: (
      <>
        <strong>Stock critique</strong> — Fil DMC Écru : 3 unités restantes
      </>
    ),
    time: "Il y a 34 min",
  },
  {
    type: "review",
    icon: <Star size={14} />,
    dot: "activityDotBlue",
    text: (
      <>
        <strong>Nouvel avis 5★</strong> — Kit "Edelweiss Brodé" par Heidi K.
      </>
    ),
    time: "Il y a 1h",
  },
  {
    type: "order",
    icon: <Truck size={14} />,
    dot: "activityDotGreen",
    text: (
      <>
        <strong>Commande #2846 expédiée</strong> — Numéro de suivi Post CH
        ajouté
      </>
    ),
    time: "Il y a 2h",
  },
  {
    type: "promo",
    icon: <Percent size={14} />,
    dot: "activityDotRose",
    text: (
      <>
        <strong>Coupon PRINTEMPS24</strong> utilisé 8 fois aujourd'hui
      </>
    ),
    time: "Il y a 3h",
  },
  {
    type: "message",
    icon: <MessageSquare size={14} />,
    dot: "activityDotBlue",
    text: (
      <>
        <strong>Message client</strong> — Demande de conseil fil pour Hardanger
      </>
    ),
    time: "Il y a 4h",
  },
];

const TOP_PRODUITS = [
  {
    nom: 'Kit "Edelweiss Brodé"',
    cat: "Kits broderie",
    revenue: "CHF 1 848",
    pct: 92,
    icon: "🌼",
    bg: "#FDF2F8",
  },
  {
    nom: "Fil DMC Mouliné Rose",
    cat: "Fils & Cotons",
    revenue: "CHF 1 170",
    pct: 78,
    icon: "🎀",
    bg: "#fdf4ff",
  },
  {
    nom: 'Kit "Jardin Alpin"',
    cat: "Kits broderie",
    revenue: "CHF 962",
    pct: 65,
    icon: "🌸",
    bg: "#fce7f3",
  },
  {
    nom: "Ciseaux Dorés — Stork",
    cat: "Accessoires",
    revenue: "CHF 735",
    pct: 52,
    icon: "✂️",
    bg: "#fefce8",
  },
  {
    nom: 'Kit Débutant "Montagne"',
    cat: "Kits broderie",
    revenue: "CHF 628",
    pct: 44,
    icon: "🏔️",
    bg: "#f0fdf4",
  },
];

const STOCK_ALERTE = [
  {
    nom: "Fil DMC Écru 712",
    qty: 3,
    icon: "🧵",
    bg: "#FDF2F8",
    critique: true,
  },
  {
    nom: "Toile Aida 18ct Blanc",
    qty: 6,
    icon: "🪡",
    bg: "#fdf4ff",
    critique: false,
  },
  {
    nom: "Cerceau 15cm Bois",
    qty: 4,
    icon: "⭕",
    bg: "#fefce8",
    critique: true,
  },
  {
    nom: 'Patron "Lac Léman"',
    qty: 8,
    icon: "💧",
    bg: "#eff6ff",
    critique: false,
  },
];

const CHART_DATA = [
  { mois: "Oct", val: 42 },
  { mois: "Nov", val: 68 },
  { mois: "Déc", val: 95 },
  { mois: "Jan", val: 55 },
  { mois: "Fév", val: 71 },
  { mois: "Mar", val: 88 },
  { mois: "Avr", val: 78 },
];

const NAV = [
  {
    icon: <LayoutDashboard size={16} />,
    label: "Tableau de bord",
    id: "dashboard",
  },
  {
    icon: <ShoppingBag size={16} />,
    label: "Commandes",
    id: "orders",
    badge: 4,
  },
  { icon: <Package size={16} />, label: "Produits", id: "products" },
  { icon: <Users size={16} />, label: "Clientes", id: "clients" },
  { icon: <Tag size={16} />, label: "Promotions", id: "promos" },
  { icon: <MessageSquare size={16} />, label: "Avis", id: "reviews", badge: 2 },
  { icon: <BarChart2 size={16} />, label: "Statistiques", id: "stats" },
  { icon: <Settings size={16} />, label: "Paramètres", id: "settings" },
];

function StatusBadge({ statut, label }) {
  const cls =
    {
      paid: s.badgePaid,
      pending: s.badgePending,
      shipped: s.badgeShipped,
      refunded: s.badgeRefund,
    }[statut] ?? "";
  const icons = {
    paid: <CheckCircle size={10} />,
    pending: <Clock size={10} />,
    shipped: <Truck size={10} />,
    refunded: <RefreshCw size={10} />,
  };
  return (
    <span className={`${s.badge} ${cls}`}>
      {icons[statut]} {label}
    </span>
  );
}

const maxVal = Math.max(...CHART_DATA.map((d) => d.val));

export default function Admin() {
  const [activeNav, setActiveNav] = useState("dashboard");

  return (
    <div className={s.adminRoot}>
      {/* ── Sidebar ── */}
      <aside className={s.sidebar} aria-label="Navigation administration">
        <div className={s.sidebarLogo}>
          <span className={s.sidebarLogoText}>Au Point-Compté</span>
          <span className={s.sidebarLogoSub}>Administration</span>
        </div>

        <nav className={s.sidebarNav}>
          <p className={s.sidebarSection}>Menu</p>
          {NAV.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className={`${s.sidebarItem} ${
                activeNav === item.id ? s.sidebarItemActive : ""
              }`}
              onClick={() => setActiveNav(item.id)}
              role="button"
              tabIndex={0}
              aria-current={activeNav === item.id ? "page" : undefined}
              onKeyDown={(e) => e.key === "Enter" && setActiveNav(item.id)}
            >
              {item.icon}
              {item.label}
              {item.badge && (
                <span className={s.sidebarBadge}>{item.badge}</span>
              )}
            </div>
          ))}

          <p className={s.sidebarSection} style={{ marginTop: 8 }}>
            Outils
          </p>
          {NAV.slice(6).map((item) => (
            <div
              key={item.id}
              className={`${s.sidebarItem} ${
                activeNav === item.id ? s.sidebarItemActive : ""
              }`}
              onClick={() => setActiveNav(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setActiveNav(item.id)}
            >
              {item.icon}
              {item.label}
            </div>
          ))}
        </nav>

        <div className={s.sidebarFooter}>
          <div className={s.sidebarUser}>
            <div className={s.sidebarAvatar}>👩</div>
            <div>
              <p className={s.sidebarUserName}>Juju Admin</p>
              <p className={s.sidebarUserRole}>Administratrice</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Contenu ── */}
      <div className={s.main}>
        {/* Topbar */}
        <header className={s.topbar}>
          <div className={s.topbarLeft}>
            <span className={s.topbarTitle}>Tableau de bord</span>
            <span className={s.topbarSub}>
              Mercredi 30 avril 2026 — Bonne journée, Juju 👋
            </span>
          </div>
          <div className={s.topbarActions}>
            <button className={s.topbarBtn}>
              <Eye size={14} /> Voir la boutique
            </button>
            <button className={`${s.topbarBtn} ${s.topbarBtnPrimary}`}>
              <Plus size={14} /> Nouveau produit
            </button>
            <button className={s.topbarNotif} aria-label="Notifications">
              <Bell size={16} />
              <span className={s.topbarNotifDot} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Contenu principal */}
        <div className={s.content}>
          {/* KPIs */}
          <div className={s.kpiGrid}>
            <div className={`${s.kpiCard} ${s.kpiCardRose}`}>
              <div className={`${s.kpiIcon} ${s.kpiIconRose}`}>
                <ShoppingBag size={18} />
              </div>
              <p className={s.kpiLabel}>Chiffre d'affaires</p>
              <p className={s.kpiValue}>CHF 18 420</p>
              <p className={`${s.kpiDelta} ${s.kpiDeltaUp}`}>
                <TrendingUp size={12} /> +23.4% ce mois
              </p>
            </div>

            <div className={`${s.kpiCard} ${s.kpiCardGold}`}>
              <div className={`${s.kpiIcon} ${s.kpiIconGold}`}>
                <Package size={18} />
              </div>
              <p className={s.kpiLabel}>Commandes</p>
              <p className={s.kpiValue}>284</p>
              <p className={`${s.kpiDelta} ${s.kpiDeltaUp}`}>
                <TrendingUp size={12} /> +12 cette semaine
              </p>
            </div>

            <div className={`${s.kpiCard} ${s.kpiCardGreen}`}>
              <div className={`${s.kpiIcon} ${s.kpiIconGreen}`}>
                <Users size={18} />
              </div>
              <p className={s.kpiLabel}>Nouvelles clientes</p>
              <p className={s.kpiValue}>47</p>
              <p className={`${s.kpiDelta} ${s.kpiDeltaUp}`}>
                <TrendingUp size={12} /> +8 vs semaine passée
              </p>
            </div>

            <div className={`${s.kpiCard} ${s.kpiCardBlue}`}>
              <div className={`${s.kpiIcon} ${s.kpiIconBlue}`}>
                <Star size={18} />
              </div>
              <p className={s.kpiLabel}>Note moyenne</p>
              <p className={s.kpiValue}>4.9 / 5</p>
              <p className={`${s.kpiDelta} ${s.kpiDeltaDown}`}>
                <TrendingDown size={12} /> 2 avis en attente
              </p>
            </div>
          </div>

          {/* Grille commandes + activité */}
          <div className={s.mainGrid}>
            {/* Dernières commandes */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div>
                  <p className={s.cardTitle}>Dernières commandes</p>
                  <p className={s.cardSub}>6 commandes récentes</p>
                </div>
                <button className={s.cardAction}>
                  Voir tout <ChevronRight size={13} />
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Cliente</th>
                    <th>Statut</th>
                    <th>Montant</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {COMMANDES.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className={s.orderNum}>{c.id}</span>
                      </td>
                      <td>
                        <p className={s.orderClient}>{c.client}</p>
                        <p className={s.orderClientEmail}>{c.email}</p>
                      </td>
                      <td>
                        <StatusBadge statut={c.statut} label={c.statusLabel} />
                      </td>
                      <td>
                        <span className={s.orderAmount}>{c.montant}</span>
                      </td>
                      <td style={{ fontSize: 11, color: "#9D6480" }}>
                        {c.date}
                      </td>
                      <td>
                        <button className={s.tableAction}>
                          <Edit2
                            size={11}
                            style={{ display: "inline", marginRight: 3 }}
                          />
                          Détail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Activité récente */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div>
                  <p className={s.cardTitle}>Activité récente</p>
                  <p className={s.cardSub}>Mises à jour en temps réel</p>
                </div>
              </div>
              <div className={s.activityList}>
                {ACTIVITE.map((a, i) => (
                  <div key={i} className={s.activityItem}>
                    <div className={`${s.activityDot} ${s[a.dot]}`}>
                      {a.icon}
                    </div>
                    <p className={s.activityText}>{a.text}</p>
                    <span className={s.activityTime}>{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom grid */}
          <div className={s.bottomGrid}>
            {/* Top produits */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div>
                  <p className={s.cardTitle}>Top produits</p>
                  <p className={s.cardSub}>Par chiffre d'affaires ce mois</p>
                </div>
                <button className={s.cardAction}>
                  Voir tout <ChevronRight size={13} />
                </button>
              </div>
              {TOP_PRODUITS.map((p, i) => (
                <div key={i} className={s.productRow}>
                  <div
                    className={s.productRowThumb}
                    style={{ background: p.bg }}
                  >
                    {p.icon}
                  </div>
                  <div className={s.productRowInfo}>
                    <p className={s.productRowName}>{p.nom}</p>
                    <p className={s.productRowCat}>{p.cat}</p>
                  </div>
                  <div className={s.productRowBar}>
                    <div
                      className={s.productRowBarFill}
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <p className={s.productRowRevenue}>{p.revenue}</p>
                </div>
              ))}
            </div>

            {/* Alertes stock */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div>
                  <p className={s.cardTitle}>Alertes stock</p>
                  <p className={s.cardSub}>4 articles à réapprovisionner</p>
                </div>
                <span className={`${s.badge} ${s.badgePending}`}>
                  <AlertTriangle size={10} /> Urgent
                </span>
              </div>
              {STOCK_ALERTE.map((item, i) => (
                <div key={i} className={s.stockRow}>
                  <div className={s.stockThumb} style={{ background: item.bg }}>
                    {item.icon}
                  </div>
                  <div className={s.stockInfo}>
                    <p className={s.stockName}>{item.nom}</p>
                    <p
                      className={`${s.stockQty} ${
                        item.critique ? s.stockQtyCritical : s.stockQtyLow
                      }`}
                    >
                      {item.critique ? "⚠ " : ""}
                      {item.qty} unités restantes
                    </p>
                  </div>
                  <button className={s.stockBtn}>Commander</button>
                </div>
              ))}
            </div>

            {/* Mini chart CA mensuel */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div>
                  <p className={s.cardTitle}>CA mensuel</p>
                  <p className={s.cardSub}>7 derniers mois</p>
                </div>
                <span className={`${s.badge} ${s.badgePaid}`}>
                  <ArrowUpRight size={10} /> +23.4%
                </span>
              </div>
              <div className={s.miniChart}>
                <div
                  className={s.miniChartBars}
                  aria-label="Graphique chiffre d'affaires mensuel"
                >
                  {CHART_DATA.map((d, i) => (
                    <div
                      key={i}
                      className={`${s.miniChartBar} ${
                        i === CHART_DATA.length - 1 ? s.miniChartBarActive : ""
                      }`}
                      style={{ height: `${(d.val / maxVal) * 100}%` }}
                      title={`${d.mois} : CHF ${d.val * 200}`}
                      role="img"
                      aria-label={`${d.mois} : CHF ${d.val * 200}`}
                    />
                  ))}
                </div>
                <div className={s.miniChartLabels}>
                  {CHART_DATA.map((d, i) => (
                    <span key={i} className={s.miniChartLabel}>
                      {d.mois}
                    </span>
                  ))}
                </div>
                <div className={s.miniChartTotal}>
                  <span className={s.miniChartTotalValue}>CHF 18 420</span>
                  <span className={s.miniChartTotalLabel}>
                    Total avril 2026
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
