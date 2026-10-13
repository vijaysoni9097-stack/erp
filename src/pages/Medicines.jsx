import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import '../styles/Medicines.css';

const PAGE_SIZE = 50;
const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—';

function Medicines() {
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supplierError, setSupplierError] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSupplierError(false);
    Promise.allSettled([
      api.get('/medicines', { signal: controller.signal }),
      api.get('/suppliers', { signal: controller.signal }),
    ]).then(([catalog, supplierList]) => {
      if (controller.signal.aborted) return;
      if (catalog.status === 'fulfilled') {
        setMedicines(catalog.value.data);
        setPage(1);
      } else {
        setError('Could not load medicines. Check that the local service is running, then retry.');
      }
      if (supplierList.status === 'fulfilled') {
        setSuppliers(Object.fromEntries(supplierList.value.data.map(s => [s.id, s.name])));
      } else {
        setSupplierError(true);
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  const expiring = (m) => {
    const date = new Date(`${m.expiry_date}T00:00:00`);
    return date >= today && date <= soon;
  };
  const supplierName = (m) => suppliers[m.supplier_id] || (m.supplier_id ? `Supplier #${m.supplier_id}` : '—');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return medicines.filter(m =>
      (!term || [m.name, m.generic_name, m.sku, m.batch_number, suppliers[m.supplier_id]].some(v => v?.toLowerCase().includes(term))) &&
      (filter === 'all' || (filter === 'low' && m.stock_quantity <= m.reorder_level) || (filter === 'expiring' && expiring(m)))
    );
  }, [medicines, suppliers, search, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const cards = [
    { label: 'Total Medicines', value: medicines.length, tone: 'blue', icon: 'fa-capsules' },
    { label: 'In Stock', value: medicines.filter(m => m.stock_quantity > 0).length, tone: 'green', icon: 'fa-pills' },
    { label: 'Low / No Stock', value: medicines.filter(m => m.stock_quantity <= m.reorder_level).length, tone: 'amber', icon: 'fa-triangle-exclamation' },
    { label: 'Expiring in 30 Days', value: medicines.filter(expiring).length, tone: 'red', icon: 'fa-calendar-days' },
  ];
  return (
    <div className="medicines-page">
      <header className="medicines-header">
        <div><p className="eyebrow">Pharmacy Inventory</p><h1>Medicines</h1></div>
        <button type="button" className="secondary-btn" disabled={loading} onClick={() => setReload(v => v + 1)}>Refresh</button>
      </header>
      <section className="summary-grid" aria-label="Medicine summary statistics">
        {cards.map(card => <article key={card.label} className="summary-card">
          <div className="summary-copy"><p>{card.label}</p><div className="summary-row"><strong>{loading || error ? '—' : card.value.toLocaleString()}</strong></div></div>
          <span className={`summary-icon ${card.tone}`}><i className={`fa-solid ${card.icon}`} /></span>
        </article>)}
      </section>
      <section className="medicines-toolbar">
        <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input aria-label="Search medicines" type="search" placeholder="Search name, SKU, batch or supplier" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className="toolbar-actions">{[['all', 'All Medicines'], ['low', 'Low Stock'], ['expiring', 'Expiring Soon']].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={`filter-button ${filter === key ? 'active' : ''}`} onClick={() => { setFilter(key); setPage(1); }}>{label}</button>)}</div>
      </section>
      <section className="medicines-panel">
        <div className="panel-head"><h2>Medicine Inventory</h2><span>{!loading && !error && `${filtered.length.toLocaleString()} medicines`}</span></div>
        {supplierError && <p role="status">Supplier names could not be loaded. Refresh to try again.</p>}
        {loading ? <p role="status">Loading medicines…</p> : error ? <p role="alert">{error} <button onClick={() => setReload(v => v + 1)}>Retry</button></p> : <>
          <div className="table-wrap"><table className="medicines-table">
            <thead><tr><th>Medicine / SKU / Batch</th><th>Generic Name</th><th>Stock</th><th>Reorder</th><th>Supplier</th><th>Expiry</th><th>Status</th></tr></thead>
            <tbody>{visible.map(m => <tr key={m.id}>
              <td><div className="medicine-meta"><strong>{m.name}</strong><small>{m.sku} · {m.batch_number}</small></div></td>
              <td>{m.generic_name || '—'}</td><td>{m.stock_quantity}</td><td>{m.reorder_level}</td><td>{supplierName(m)}</td><td>{dateLabel(m.expiry_date)}</td>
              <td><span className={`status-pill ${m.stock_quantity === 0 ? 'critical' : m.stock_quantity <= m.reorder_level ? 'low-stock' : 'in-stock'}`}>{m.stock_quantity === 0 ? 'No Stock' : m.stock_quantity <= m.reorder_level ? 'Low Stock' : 'In Stock'}</span></td>
            </tr>)}{visible.length === 0 && <tr><td colSpan={7}>{medicines.length ? 'No medicines match your search or filter.' : 'No medicines in the local database.'}</td></tr>}</tbody>
          </table></div>
          <div className="panel-head"><span>Page {currentPage} of {pages}</span><div className="panel-head-actions"><button className="ghost-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="ghost-btn" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
        </>}
      </section>
    </div>
  );
}
export default Medicines;
