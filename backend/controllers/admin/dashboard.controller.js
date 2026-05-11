const dashboardRepository = require('../../repositories/dashboard.repository');

const getStats = async (req, res, next) => {
  try {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    const [{ caRows, ordersRows, custRows, reviewRows }, chartRows, topRows, lowStockRows, recentOrders] =
      await Promise.all([
        dashboardRepository.getStats({ month, year }),
        dashboardRepository.getChart(),
        dashboardRepository.getTopProducts({ month, year }),
        dashboardRepository.getLowStock(),
        dashboardRepository.getRecentOrders(),
      ]);

    const revenueMonth = parseFloat(caRows.revenue_month ?? 0);
    const revenuePrev  = parseFloat(caRows.revenue_prev  ?? 0);
    const revenueTrend = revenuePrev > 0
      ? Math.round(((revenueMonth - revenuePrev) / revenuePrev) * 1000) / 10
      : null;

    const ordersWeek     = ordersRows.orders_week      ?? 0;
    const ordersPrevWeek = ordersRows.orders_prev_week ?? 0;
    const ordersPending  = ordersRows.orders_pending   ?? 0;
    const ordersTrend    = ordersPrevWeek > 0
      ? Math.round(((ordersWeek - ordersPrevWeek) / ordersPrevWeek) * 1000) / 10
      : null;

    const customersNew  = custRows.customers_new  ?? 0;
    const customersPrev = custRows.customers_prev ?? 0;
    const customersTrend = customersPrev > 0
      ? Math.round(((customersNew - customersPrev) / customersPrev) * 1000) / 10
      : null;

    const maxRevenue = Math.max(...chartRows.map(r => parseFloat(r.revenue ?? 0)), 1);
    const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
    const chart = chartRows.map(r => ({
      month:   r.month_label,
      value:   parseFloat(r.revenue ?? 0),
      pct:     Math.round((parseFloat(r.revenue ?? 0) / maxRevenue) * 100),
      current: r.month_key === currentMonthKey,
    }));

    const maxTopRevenue = parseFloat(topRows[0]?.revenue ?? 1);
    const topProducts = topRows.map(r => ({
      id:        r.id,
      name:      r.name ?? `Produit #${r.id}`,
      category:  r.category_name ?? '—',
      revenue:   parseFloat(r.revenue ?? 0),
      pct:       Math.round((parseFloat(r.revenue ?? 0) / maxTopRevenue) * 100),
      image_url: r.image_url ?? null,
    }));

    const lowStock = lowStockRows.map(r => ({
      id:        r.id,
      name:      r.name ?? `Produit #${r.id}`,
      stock:     r.stock,
      urgent:    r.stock <= 2,
      image_url: r.image_url ?? null,
    }));

    res.json({
      success: true,
      data: {
        stats: {
          revenue_month:   revenueMonth,
          revenue_trend:   revenueTrend,
          orders_week:     ordersWeek,
          orders_pending:  ordersPending,
          orders_trend:    ordersTrend,
          customers_new:   customersNew,
          customers_trend: customersTrend,
          rating_avg:      parseFloat(reviewRows.rating_avg ?? 0),
          rating_pending:  reviewRows.rating_pending ?? 0,
        },
        chart,
        top_products: topProducts,
        low_stock:    lowStock,
        recent_orders: recentOrders.map(o => ({
          id:             o.id,
          customer_name:  `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—',
          customer_email: o.email ?? '',
          status:         o.status,
          total:          parseFloat(o.total ?? 0),
          created_at:     o.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats };
