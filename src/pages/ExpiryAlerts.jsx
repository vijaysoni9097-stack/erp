import { useEffect, useState } from 'react';
import { isExpiringSoon, expiryDaysRemaining } from '../services/expiry';
import { api } from '../services/api';
import '../styles/ExpiryAlerts.css';

export default function ExpiryAlerts() {
  const [data, setData] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [view, setView] = useState('soon');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([api.get('/medicines/expiry-alerts', { signal: controller.signal, timeout: 90000 }), api.get('/medicines', { signal: controller.signal, timeout: 90000 })])
      .then(([alerts,catalog]) => { if (!controller.signal.aborted) { setData(alerts.data); setMedicines(catalog.data); setPage(1); } })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load expiry alerts. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const soon = medicines.filter(m => isExpiringSoon(m)).map(m => ({...m, days_remaining:expiryDaysRemaining(m.expiry_date)})).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date)||a.id-b.id);
  const items = view === 'soon' ? soon : data?.items || [];
  const pages = Math.max(1, Math.ceil(items.length / 50));
  return <div className="inventory-page">
    <header className="inventory-header"><div><p className="eyebrow">Inventory</p><h1>Expiry Alerts</h1></div><button className="primary-btn" disabled={loading} onClick={() => setReload(v => v+1)}>Refresh</button></header>
    <section className="alerts-panel"><div className="panel-head"><h2>Medicine Expiry List</h2><select aria-label="Expiry list view" value={view} onChange={event=>{setView(event.target.value);setPage(1);}}><option value="soon">Expiring Soon · 30 Days</option><option value="configured">Configured alerts</option></select></div>
      {loading ? <p role="status">Loading expiry alerts…</p> : error ? <p role="alert">{error}</p> : view === 'configured' && !data.enabled ? <p>Expiry alerts are disabled in Inventory Settings.</p> : <>
        <p><strong>Expiring Soon · 30 Days: {soon.length} batches</strong></p>
        {view === 'soon' ? <p>In-stock batches expiring today through 30 days ahead, including both dates. Matches Dashboard and Medicines. Excludes expired and zero-stock batches.</p> : <p>Configured alerts include expired batches and medicines expiring within {data.lead_days} days, including zero-stock records. This broader list differs from the Expiring Soon count.</p>}
        {!items.length && <p>No medicines are due to expire in this period.</p>}
        <div className="alerts-list">{items.slice((page-1)*50,page*50).map(item => {
          const days = item.days_remaining;
          const tone = days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'safe';
          return <div key={item.id} className="alert-row"><span className={`alert-icon ${tone}`}><i className="fa-solid fa-clock" /></span><div className="alert-copy"><strong>{item.name}</strong><small>Batch {item.batch_number} · {item.expiry_date} · Stock: {item.stock_quantity}</small></div><span className={`expiry-badge ${tone}`}>{days < 0 ? `Expired ${-days} days ago` : days === 0 ? 'Expires today' : `${days} days remaining`}</span></div>;
        })}</div>
        <p>Page {page} of {pages} · {items.length} alerts</p><button disabled={page<=1} onClick={() => setPage(p=>p-1)}>Previous</button>{' '}<button disabled={page>=pages} onClick={() => setPage(p=>p+1)}>Next</button>
      </>}
    </section>
  </div>;
}
