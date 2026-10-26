import { useCurrency } from '../contexts/CurrencyContext';
import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { dayKey } from '../services/dailySales';
import { dashboardData, salesTrendForDates } from "../services/dashboardData";
import "../styles/dashboard.css";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function Dashboard() {
  const { currency, symbol, formatMoney } = useCurrency();
  const [dateFrom, setDateFrom] = useState(() => { const date = new Date(); date.setDate(1); return dayKey(date); });
  const [dateTo, setDateTo] = useState(dayKey);
  const [period, setPeriod] = useState("This Week");

  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = false;
    const refresh = async () => {
      if (active) return;
      active = true;
      try {
        const names = ['medicines','sales','purchase-orders','prescriptions','customers','suppliers'];
        const responses = await Promise.all(names.map(name => api.get(`/${name}`, { signal:controller.signal, timeout:90000 })));
        if (controller.signal.aborted) return;
        if (responses.some(r => !Array.isArray(r.data))) throw new Error('Invalid dashboard data');
        setRecords(Object.fromEntries(['medicines','sales','orders','prescriptions','customers','suppliers'].map((key,i)=>[key,responses[i].data])));
        setUpdated(new Date()); setError('');
      } catch { if (!controller.signal.aborted) setError('Dashboard could not refresh. Displayed figures may be out of date.'); }
      finally { active = false; }
    };
    refresh();
    const timer = setInterval(refresh,30000);
    ['focus','erp:data-saved'].forEach(event=>window.addEventListener(event,refresh));
    return () => { controller.abort(); clearInterval(timer); ['focus','erp:data-saved'].forEach(event=>window.removeEventListener(event,refresh)); };
  }, []);
  const data = useMemo(()=>records ? dashboardData(records) : null,[records]);
  const { salesByPeriod, stockByCategory, recentPrescriptions, expiryAlerts, lowStockMedicines, topSellingMedicines, supplierRows: suppliers } = data || {salesByPeriod:{},stockByCategory:[],recentPrescriptions:[],expiryAlerts:[],lowStockMedicines:[],topSellingMedicines:[],supplierRows:[]};
  const summaryCards = data ? [
    {label:'Today’s Sales',value:formatMoney(data.todaySales),note:'Completed invoices · local day',icon:'fa-receipt',tone:'blue'},
    {label:'Total Medicines',value:data.totalMedicines,note:'Saved medicine batches',icon:'fa-capsules',tone:'blue'},
    {label:'Pending Orders',value:data.pendingOrders,note:'Awaiting approval or receipt',icon:'fa-cart-shopping',tone:'yellow'},
    {label:'Zero Stock Items',value:data.zeroStock,note:'No available units',icon:'fa-box-open',tone:'red'},
    {label:'Low Stock Items',value:data.low.length,note:'Positive stock at or below reorder level',icon:'fa-triangle-exclamation',tone:'red'},
    {label:'Expiring Soon · 30 Days',value:data.expiry.length,note:'In-stock batches within 30 days',icon:'fa-calendar-days',tone:'sky'},
  ] : [];
  const rangeError = period === 'Custom dates' && (!dateFrom || !dateTo || dateFrom > dateTo);
  const trend = useMemo(() => period === 'Custom dates'
    ? salesTrendForDates(records?.sales || [], dateFrom, dateTo)
    : data?.salesByPeriod[period] || [], [records, data, period, dateFrom, dateTo]);

  return (
    <section className="dashboard-page">
      <header className="dashboard-header">
        <div><h1>Pharmacist Dashboard</h1><p className="dashboard-subtitle">Sales, stock and the items that need your attention.</p></div>
        <div className="dashboard-buttons">
          <button type="button" className="purchase-btn" onClick={() => (window.location.href = "/purchase-orders?new=1")}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> New Purchase Order
          </button>
          <button type="button" className="stock-btn" onClick={() => (window.location.href = "/stock-management")}>
            <i className="fa-solid fa-boxes-stacked" aria-hidden="true" /> Manage Stock
          </button>
        </div>
      </header>

      <div className={`dashboard-update ${error ? 'has-error' : ''}`} role="status"><span className="dashboard-update-dot" /><span>{error || (updated ? `Updated ${updated.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} · Refreshes automatically` : 'Loading pharmacy data…')}</span></div>
      <div className="dashboard-cards dashboard-summary-row">
        {summaryCards.map((card) => (
          <article className={`dashboard-card ${card.label === 'Today’s Sales' ? 'dashboard-card-sales' : ''}`} key={card.label}>
            <div>
              <p className="stat-label">{card.label}</p>
              <div className="stat-value-row">
                <strong>{card.value}</strong>

              </div>
            </div>
            <span className={`stat-icon ${card.tone}`} aria-hidden="true"><i className={`fa-solid ${card.icon}`} /></span>
            <p className="stat-note">{card.note}</p>
          </article>
        ))}
      </div>

      <section className="dashboard-panel dashboard-collections" aria-labelledby="collections-title">
        <div className="panel-header"><h2 id="collections-title">Today’s Collections</h2><span className="dashboard-period-note">Completed invoices · local day</span></div>
        <div className="dashboard-cards dashboard-payment-cards">{[['cash', 'Cash', 'fa-money-bill-wave'], ['card', 'Card', 'fa-credit-card'], ['upi', 'UPI', 'fa-mobile-screen-button']].map(([method, label, icon]) => <article className="dashboard-card" key={method}><div><p className="stat-label">{label}</p><div className="stat-value-row"><strong>{data ? formatMoney(data.todayPayments[method]) : '—'}</strong></div></div><span className="stat-icon blue" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span><p className="stat-note">Received today</p></article>)}</div>
        {data && (data.todayPayments.bank_transfer > 0 || data.todayPayments.unrecorded > 0) && <p className="dashboard-collection-note">{data.todayPayments.bank_transfer > 0 && <span>Bank transfer: {formatMoney(data.todayPayments.bank_transfer)}. </span>}{data.todayPayments.unrecorded > 0 && <span>Invoices without recorded payment details: {formatMoney(data.todayPayments.unrecorded)}.</span>}</p>}
      </section>

      <div className="dashboard-chart-grid">
        <article className="dashboard-panel sales-panel">
          <div className="panel-header">
            <h2>Medicine Sales Trend</h2>
            <div className="trend-controls">
              <label className="trend-period"><span className="visually-hidden">Sales trend period</span><i className="fa-regular fa-calendar" aria-hidden="true" /><select value={period} onChange={event => setPeriod(event.target.value)}><option value="This Week">This week</option><option value="This Month">This month</option><option value="This Year">This year</option><option value="Custom dates">Custom dates</option></select></label>
            </div>
          </div>
          {period === 'Custom dates' && <div className="trend-date-range">
            <label>From<input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} /></label>
            <span className="trend-date-arrow" aria-hidden="true">→</span>
            <label>To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} /></label>
            <span className="trend-date-caption">{rangeError ? 'Choose a valid start and end date.' : 'Completed sales · inclusive dates'}</span>
          </div>}
          {rangeError ? <p className="trend-range-error" role="alert">Select both dates, with From on or before To.</p> : <div className="sales-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 28, right: 22, left: -12, bottom: 4 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#677285", fontSize: 13 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#677285", fontSize: 13 }} />
                <YAxis yAxisId="revenue" orientation="right" tickFormatter={value=>formatMoney(value)} />
                <Tooltip cursor={{ fill: "rgba(67, 86, 216, 0.05)" }} formatter={(value, name) => name.startsWith("Revenue") ? [formatMoney(Number(value)), `Revenue (${currency})`] : [value, name]} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "18px", fontSize: "13px" }} />
                <Bar dataKey="units" name="Units Sold" fill="#4a9b8f" barSize={38} />
                <Line type="monotone" dataKey="revenue" name={`Revenue (${symbol})`} yAxisId="revenue" stroke="#4356d8" strokeWidth={3} dot={{ r: 3, fill: "#4356d8" }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>}
        </article>

        <article className="dashboard-panel stock-panel">
          <div className="panel-header"><h2>Stock by Availability</h2></div>
          <div className="stock-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stockByCategory} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius="54%" outerRadius="79%" paddingAngle={1} stroke="none" label={false} labelLine={false}>
                  {stockByCategory.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: "13px", bottom: 0 }} />
                <Tooltip formatter={(value) => `${value} units`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center-copy" aria-hidden="true">
              <span>Total Stock</span>
              <strong>{data?.totalStock ?? '—'}</strong>
            </div>
          </div>
        </article>
      </div>

      <div className="dashboard-detail-grid">
        <article className="dashboard-panel">
          <div className="panel-header"><h2>Recent Prescriptions</h2><span>Latest saved</span></div>
          <div className="table-scroll"><table className="dashboard-table"><thead><tr><th>Patient</th><th>Medicine</th><th>Prescribed By</th><th>Status</th><th /></tr></thead><tbody>{data && !recentPrescriptions.length && <tr><td colSpan={5}>No prescriptions recorded.</td></tr>}
            {recentPrescriptions.map(([patient, id, medicine, doctor, status, action, initials]) => <tr key={id}><td><div className="person-cell"><span className="patient-avatar">{initials}</span><span><strong>{patient}</strong><small>{id}</small></span></div></td><td>{medicine}</td><td>{doctor}</td><td><span className={`status-pill ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td><td><button type="button" className="table-action" onClick={()=>window.location.assign('/dispense')}>{action}</button></td></tr>)}
          </tbody></table></div>
        </article>
        <article className="dashboard-panel">
          <div className="panel-header"><h2>Expiry Alerts</h2></div><div className="expiry-list">{data && !expiryAlerts.length && <p>No in-stock batches expiring within 30 days.</p>}
            {expiryAlerts.map(([medicine, batch, days, tone]) => <div className="expiry-item" key={medicine}><span className={`alert-icon ${tone}`}><i className="fa-solid fa-clock" /></span><span className="expiry-copy"><strong>{medicine}</strong><small>{batch}</small></span><span className={`expiry-days ${tone}`}>{days}</span></div>)}
          </div><button type="button" className="panel-link" onClick={()=>window.location.assign('/medicines')}>View All Alerts <i className="fa-solid fa-arrow-right" /></button>
        </article>
      </div>

      <div className="dashboard-detail-grid">
        <article className="dashboard-panel"><div className="panel-header"><h2>Low Stock Medicines</h2><button type="button" className="panel-link inline-link" onClick={()=>window.location.assign('/stock-management')}>Manage Stock</button></div><div className="table-scroll"><table className="dashboard-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Available Qty</th><th>Reorder Level</th><th>Supplier</th><th /></tr></thead><tbody>{data && !lowStockMedicines.length && <tr><td colSpan={6}>No low-stock medicines.</td></tr>}{lowStockMedicines.map(([medicine, category, quantity, reorder, supplier]) => <tr key={medicine}><td><strong>{medicine}</strong></td><td>{category}</td><td>{quantity}</td><td>{reorder}</td><td>{supplier}</td><td><button type="button" className="table-action" onClick={()=>window.location.assign('/purchase-orders?new=1')}>Reorder</button></td></tr>)}</tbody></table></div></article>
        <article className="dashboard-panel"><div className="panel-header"><h2>Top Selling Medicines</h2><span className="dashboard-period-note">All time</span></div><div className="top-selling-list">{data && !topSellingMedicines.length && <p>No completed sales recorded.</p>}{topSellingMedicines.map(([medicine, units, progress]) => <div className="top-selling-item" key={medicine}><div><strong>{medicine}</strong><span>{units}</span></div><span className="sales-progress"><span style={{ width: `${progress}%` }} /></span></div>)}</div></article>
      </div>

      <article className="dashboard-panel suppliers-panel"><div className="panel-header"><h2>Suppliers Overview</h2><button type="button" className="panel-link inline-link" onClick={()=>window.location.assign('/suppliers')}>View All</button></div><div className="suppliers-list">{suppliers.map(([name, orders, status, tone]) => <div className="supplier-item" key={name}><span className="supplier-icon"><i className="fa-solid fa-truck-medical" /></span><span><strong>{name}</strong><small>{orders}</small></span></div>)}</div></article>
    </section>
  );
}

export default Dashboard;
