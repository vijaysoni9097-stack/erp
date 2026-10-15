import { useEffect, useState } from 'react';
import { api } from '../services/api';
import '../styles/ExpiryAlerts.css';

export default function ExpiryAlerts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get('/medicines/expiry-alerts', { signal: controller.signal, timeout: 90000 })
      .then(({data}) => { if (!controller.signal.aborted) { setData(data); setPage(1); } })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load expiry alerts. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const items = data?.items || [];
  const pages = Math.max(1, Math.ceil(items.length / 50));
  return <div className="inventory-page">
    <header className="inventory-header"><div><p className="eyebrow">Inventory</p><h1>Expiry Alerts</h1></div><button className="primary-btn" disabled={loading} onClick={() => setReload(v => v+1)}>Refresh</button></header>
    <section className="alerts-panel"><div className="panel-head"><h2>Medicine Expiry List</h2></div>
      {loading ? <p role="status">Loading expiry alerts…</p> : error ? <p role="alert">{error}</p> : !data.enabled ? <p>Expiry alerts are disabled in Inventory Settings.</p> : <>
        <p>Expired batches and medicines expiring in the next {data.lead_days} days. Includes zero-stock catalog records.</p>
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
