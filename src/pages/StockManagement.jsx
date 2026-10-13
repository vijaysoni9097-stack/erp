import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import '../styles/StockManagement.css';

export default function StockManagement() {
  const [data, setData] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get('/inventory/source-stock', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) { setData(data); setPage(1); }
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load stock. Check the local service and retry.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const rows = data.items;
  const filtered = rows.filter(r => `${r.name} ${r.source_id}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === 'all' || (filter === 'positive' && r.quantity > 0) || (filter === 'zero' && r.quantity === 0) || (filter === 'review' && (r.quantity === null || r.quantity < 0 || r.medicine_id === null))));
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.min(page, pages);
  const cards = [
    ['Recorded Stock Units (Net)', rows.reduce((n, r) => n + (r.quantity ?? 0), 0), 'blue', 'fa-cubes'],
    ['Items with Stock', rows.filter(r => r.quantity > 0).length, 'green', 'fa-circle-check'],
    ['Items with Zero Stock', rows.filter(r => r.quantity === 0).length, 'amber', 'fa-triangle-exclamation'],
    ['Negative / Missing Stock', rows.filter(r => r.quantity === null || r.quantity < 0).length, 'red', 'fa-bell'],
  ];
  return <div className="inventory-page">
    <header className="inventory-header"><div><p className="eyebrow">Inventory</p><h1>Stock Management</h1></div><button className="secondary-btn" disabled={loading} onClick={() => setReload(v => v + 1)}>Refresh</button></header>
    <section className="summary-grid" aria-label="Stock summary">{cards.map(([label, value, tone, icon]) => <article key={label} className="summary-card"><div className="summary-copy"><p>{label}</p><div className="summary-row"><strong>{loading || error ? '—' : value.toLocaleString()}</strong></div></div><span className={`summary-icon ${tone}`}><i className={`fa-solid ${icon}`} /></span></article>)}</section>
    <section className="inventory-panel"><div className="panel-head"><h2>Stock Inventory</h2><div className="panel-head-actions">
      <input aria-label="Search stock" placeholder="Search medicine or item code" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <select aria-label="Stock filter" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">All Items</option><option value="positive">With Stock</option><option value="zero">Zero Stock</option><option value="review">Needs Review</option></select>
    </div></div>
    {loading ? <p role="status">Loading stock…</p> : error ? <p role="alert">{error} <button onClick={() => setReload(v => v + 1)}>Retry</button></p> : <>
    <div className="table-wrap"><table className="inventory-table"><thead><tr><th>Medicine</th><th>Item Code</th><th>Recorded Qty</th><th>Available on Device</th><th>Last Updated</th><th>Status</th></tr></thead><tbody>
    {filtered.slice((current - 1) * 50, current * 50).map(r => <tr key={r.source_id}><td><strong>{r.name}</strong></td><td>{r.source_id}</td><td>{r.quantity === null ? 'No record' : r.quantity.toLocaleString()}</td><td>{r.allocated_quantity ?? 'Not imported'}</td><td>{r.source_modified_on ? new Date(r.source_modified_on).toLocaleDateString() : '—'}</td><td>{r.quantity === null ? 'Missing stock record' : r.quantity < 0 ? 'Negative — review' : r.medicine_id === null ? 'Catalog not imported' : r.quantity === 0 ? 'Zero Stock' : 'In Stock'}</td></tr>)}
    {!filtered.length && <tr><td colSpan={6}>No items match your search or filter.</td></tr>}
    </tbody></table></div><div className="panel-head"><span>{filtered.length.toLocaleString()} items · Page {current} of {pages}</span><div className="panel-head-actions"><button className="ghost-btn" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><button className="ghost-btn" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </>}
    </section>
  </div>;
}
