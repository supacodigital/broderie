import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingBag, Package, Users, Star,
  AlertTriangle, ChevronRight, TrendingUp, TrendingDown,
  ShoppingCart, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { roundCHF } from '../../utils/chf.js'
import { fetchDashboardStats } from '../../services/dashboard.service.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import s from './Dashboard.module.css'

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' }
  return (
    <span className={s.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>
      <span className={s.statusDot} style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

function formatRelDate(iso) {
  if (!iso) return '—'
  const d    = new Date(iso)
  const now  = new Date()
  const time = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart - 86400000)
  if (d >= todayStart)     return `Aujourd'hui ${time}`
  if (d >= yesterdayStart) return `Hier ${time}`
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' }) + ` ${time}`
}

/* ── Carte KPI ── */
function KpiCard({ icon: Icon, label, value, trend, trendLabel, sub, subColor, loading }) {
  const up = trend >= 0
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiTop}>
        <span className={s.kpiLabel}>{label}</span>
        <div className={s.kpiIconWrap}>
          <Icon size={18} />
        </div>
      </div>
      {loading
        ? <div className={s.kpiSkeleton} />
        : <div className={s.kpiValue}>{value}</div>
      }
      <div className={s.kpiBottom}>
        {trend !== null && trend !== undefined && !loading && (
          <span className={s.kpiTrend} style={{ color: up ? '#10b981' : '#ef4444' }}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {up ? '+' : ''}{trend}% {trendLabel}
          </span>
        )}
        {sub && !loading && (
          <span className={s.kpiSub} style={subColor ? { color: subColor } : {}}>
            {sub}
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Skeleton ligne ── */
function SkeletonRow() {
  return <div className={s.skRow} />
}

export default function Dashboard() {
  const { loading: authLoading } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await fetchDashboardStats()
      setData(res.data ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  /* Attendre que le token soit restauré avant d'appeler l'API */
  useEffect(() => {
    if (!authLoading) load()
  }, [authLoading, load])

  const stats       = data?.stats        ?? {}
  const chart       = data?.chart        ?? []
  const topProducts = data?.top_products ?? []
  const lowStock    = data?.low_stock    ?? []
  const orders      = data?.recent_orders ?? []

  /* Mois courant pour le label du graphique */
  const currentMonthLabel = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className={s.page}>
      {/* ── En-tête ── */}
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Tableau de bord</h1>
        </div>
        <button className={s.refreshBtn} onClick={load} disabled={loading} title="Actualiser">
          <RefreshCw size={15} className={loading ? s.spin : ''} />
        </button>
      </div>

      {/* ── Erreur réseau ── */}
      {error && !loading && (
        <div className={s.errorBanner}>
          <AlertTriangle size={15} />
          Impossible de charger les données. <button onClick={load} className={s.retryLink}>Réessayer</button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className={s.kpiGrid}>
        <KpiCard
          icon={ShoppingBag}
          label="CA du mois"
          value={`CHF ${roundCHF(stats.revenue_month ?? 0).toLocaleString('fr-CH')}`}
          trend={stats.revenue_trend}
          trendLabel="vs mois précédent"
          loading={loading}
        />
        <KpiCard
          icon={ShoppingCart}
          label="Commandes cette semaine"
          value={stats.orders_week ?? 0}
          trend={stats.orders_trend}
          trendLabel="vs semaine passée"
          sub={stats.orders_pending > 0 ? `${stats.orders_pending} en attente` : null}
          subColor="#d97706"
          loading={loading}
        />
        <KpiCard
          icon={Users}
          label="Nouveaux clients"
          value={stats.customers_new ?? 0}
          trend={stats.customers_trend}
          trendLabel="vs semaine passée"
          loading={loading}
        />
        <KpiCard
          icon={Star}
          label="Note moyenne"
          value={stats.rating_avg ? `${stats.rating_avg} / 5` : '—'}
          sub={stats.rating_pending > 0 ? `${stats.rating_pending} avis en attente` : 'Aucun avis en attente'}
          subColor={stats.rating_pending > 0 ? '#d97706' : '#10b981'}
          loading={loading}
        />
      </div>

      {/* ── Grille principale ── */}
      <div className={s.mainGrid}>
        {/* Colonne gauche */}
        <div className={s.leftCol}>

          {/* Dernières commandes */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Dernières commandes</h2>
                <p className={s.cardSub}>{loading ? '…' : `${orders.length} commandes récentes`}</p>
              </div>
              <Link to="/commandes" className={s.cardLink}>Voir tout <ChevronRight size={13} /></Link>
            </div>
            <div className={s.ordersTable}>
              <div className={s.ordersHead}>
                <span>N°</span>
                <span>Cliente</span>
                <span>Statut</span>
                <span>Montant</span>
                <span>Date</span>
                <span />
              </div>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={s.ordersRow}>
                      {Array.from({ length: 6 }).map((__, j) => <SkeletonRow key={j} />)}
                    </div>
                  ))
                : orders.length === 0
                  ? <p className={s.emptyMsg}>Aucune commande pour l'instant.</p>
                  : orders.map(o => (
                      <div key={o.id} className={s.ordersRow}>
                        <span className={s.orderId}>#{o.id}</span>
                        <div className={s.orderCustomer}>
                          <span className={s.orderName}>{o.customer_name}</span>
                          <span className={s.orderEmail}>{o.customer_email}</span>
                        </div>
                        <StatusBadge status={o.status} />
                        <span className={s.orderTotal}>CHF {roundCHF(o.total).toFixed(2)}</span>
                        <span className={s.orderDate}>{formatRelDate(o.created_at)}</span>
                        <Link to={`/commandes?open=${o.id}`} className={s.detailBtn}>Détail</Link>
                      </div>
                    ))
              }
            </div>
          </section>

          {/* Bas colonne gauche */}
          <div className={s.bottomRow}>
            {/* Top produits */}
            <section className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <h2 className={s.cardTitle}>Top produits</h2>
                  <p className={s.cardSub}>CA ce mois</p>
                </div>
                <Link to="/produits" className={s.cardLink}>Voir tout <ChevronRight size={13} /></Link>
              </div>
              <div className={s.topList}>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={s.topItem}>
                        <div className={`${s.topThumb} ${s.skBlock}`} />
                        <div className={s.topInfo}>
                          <div className={`${s.skLine} ${s.skMid}`} />
                          <div className={`${s.skLine} ${s.skShort}`} />
                        </div>
                        <div className={`${s.topBar} ${s.skBlock}`} style={{ height: 4 }} />
                        <div className={`${s.skLine} ${s.skShort}`} />
                      </div>
                    ))
                  : topProducts.length === 0
                    ? <p className={s.emptyMsg}>Aucune vente ce mois.</p>
                    : topProducts.map(p => (
                        <div key={p.id} className={s.topItem}>
                          <div className={s.topThumb}><Package size={14} /></div>
                          <div className={s.topInfo}>
                            <span className={s.topName}>{p.name}</span>
                            <span className={s.topCat}>{p.category}</span>
                          </div>
                          <div className={s.topBar}>
                            <div className={s.topBarFill} style={{ width: `${p.pct}%` }} />
                          </div>
                          <span className={s.topRevenue}>CHF {p.revenue.toLocaleString('fr-CH')}</span>
                        </div>
                      ))
                }
              </div>
            </section>

            {/* Alertes stock */}
            <section className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <h2 className={s.cardTitle}>Alertes stock</h2>
                  <p className={s.cardSub}>
                    {loading ? '…' : `${lowStock.length} article${lowStock.length > 1 ? 's' : ''} ≤ 5 unités`}
                  </p>
                </div>
                {!loading && lowStock.some(i => i.urgent) && (
                  <span className={s.urgentBadge}><AlertTriangle size={11} /> Urgent</span>
                )}
              </div>
              <div className={s.stockList}>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={s.stockItem}>
                        <div className={`${s.stockThumb} ${s.skBlock}`} />
                        <div className={s.stockInfo}>
                          <div className={`${s.skLine} ${s.skMid}`} />
                          <div className={`${s.skLine} ${s.skShort}`} />
                        </div>
                      </div>
                    ))
                  : lowStock.length === 0
                    ? <p className={s.emptyMsg}>Aucune alerte de stock.</p>
                    : lowStock.map(item => (
                        <div key={item.id} className={s.stockItem}>
                          <div className={s.stockThumb}><Package size={14} /></div>
                          <div className={s.stockInfo}>
                            <span className={s.stockName}>{item.name}</span>
                            <span className={s.stockQtyLabel} style={{ color: item.urgent ? '#dc2626' : '#d97706' }}>
                              <AlertTriangle size={10} /> {item.stock} unité{item.stock > 1 ? 's' : ''} restante{item.stock > 1 ? 's' : ''}
                            </span>
                          </div>
                          <Link to="/produits" className={s.commanderBtn}>Modifier</Link>
                        </div>
                      ))
                }
              </div>
            </section>
          </div>
        </div>

        {/* Colonne droite */}
        <div className={s.rightCol}>

          {/* CA mensuel — histogramme */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>CA mensuel</h2>
                <p className={s.cardSub}>7 derniers mois</p>
              </div>
              {!loading && stats.revenue_trend !== null && stats.revenue_trend !== undefined && (
                <span className={s.trendPill} style={{ color: stats.revenue_trend >= 0 ? '#10b981' : '#ef4444', background: stats.revenue_trend >= 0 ? '#ecfdf5' : '#fef2f2' }}>
                  {stats.revenue_trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {stats.revenue_trend >= 0 ? '+' : ''}{stats.revenue_trend}%
                </span>
              )}
            </div>
            <div className={s.chartWrap}>
              {loading
                ? <div className={s.chartSkeleton} />
                : (
                  <>
                    <div className={s.chartBars}>
                      {chart.map((bar, i) => (
                        <div key={i} className={s.chartBar}>
                          <div
                            className={s.chartBarFill}
                            style={{ height: `${bar.pct}%`, opacity: bar.current ? 1 : 0.5 }}
                          />
                          <span className={s.chartLabel}>{bar.month}</span>
                        </div>
                      ))}
                    </div>
                    <div className={s.chartTotal}>
                      <span className={s.chartTotalLabel}>
                        CHF {roundCHF(stats.revenue_month ?? 0).toLocaleString('fr-CH')}
                      </span>
                      <span className={s.chartTotalSub}>{currentMonthLabel}</span>
                    </div>
                  </>
                )
              }
            </div>
          </section>

          {/* Raccourcis rapides */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Accès rapide</h2>
            </div>
            <div className={s.quickLinks}>
              <Link to="/commandes?status=awaiting_payment" className={s.quickLink}>
                <ShoppingCart size={15} />
                <span>Commandes en attente</span>
                {stats.orders_pending > 0 && (
                  <span className={s.quickBadge}>{stats.orders_pending}</span>
                )}
              </Link>
              <Link to="/avis" className={s.quickLink}>
                <Star size={15} />
                <span>Avis à modérer</span>
                {stats.rating_pending > 0 && (
                  <span className={s.quickBadge}>{stats.rating_pending}</span>
                )}
              </Link>
              <Link to="/produits" className={s.quickLink}>
                <AlertTriangle size={15} />
                <span>Stock critique</span>
                {lowStock.length > 0 && (
                  <span className={s.quickBadge} style={{ background: '#fef2f2', color: '#dc2626' }}>
                    {lowStock.length}
                  </span>
                )}
              </Link>
              <Link to="/clients" className={s.quickLink}>
                <Users size={15} />
                <span>Nouveaux clients</span>
                {stats.customers_new > 0 && (
                  <span className={s.quickBadge}>{stats.customers_new}</span>
                )}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
