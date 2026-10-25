import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isExpiringSoon } from '../services/expiry';
import { isZeroStock, isLowStock, summarizeStock } from '../services/stockSummary';
import { api } from '../services/api';
import '../styles/Medicines.css';

const PAGE_SIZE = 50;
const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—';

function Medicines() {
  const [adding, setAdding] = useState(false);
  const addDialog = useRef(null);
  const saveLock = useRef(false);
  useEffect(() => {
    if (adding && !addDialog.current.open) addDialog.current.showModal();
    else if (!adding && addDialog.current.open) addDialog.current.close();
  }, [adding]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
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
      api.get('/medicines', { signal: controller.signal, timeout: 90000 }),
      api.get('/suppliers', { signal: controller.signal, timeout: 90000 }),
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

  async function addMedicine(event) {
    event.preventDefault();
    if (saveLock.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = { ...values, supplier_id: values.supplier_id ? Number(values.supplier_id) : null,
      generic_name: values.generic_name || null, stock_quantity: 0,
      reorder_level: Number(values.reorder_level), purchase_price: Number(values.purchase_price), selling_price: Number(values.selling_price) };
    saveLock.current = true;
    setSaving(true); setSaveError(''); setNotice('');
    try {
      const { data } = await api.post('/medicines', payload, { timeout: 90000 });
      setMedicines(current => [...current, data].sort((a,b) => a.name.localeCompare(b.name)));
      setSearch(''); setFilter('all'); setPage(1); setAdding(false);
      setNotice(`${data.name} added successfully.`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setSaveError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(e => e.msg).join(' ') : 'Could not confirm the save. Refresh and check the SKU before retrying.');
    } finally { saveLock.current = false; setSaving(false); }
  }

  const expiring = isExpiringSoon;
  const supplierName = (m) => suppliers[m.supplier_id] || (m.supplier_id ? `Supplier #${m.supplier_id}` : '—');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return medicines.filter(m =>
      (!term || [m.name, m.generic_name, m.sku, m.batch_number, suppliers[m.supplier_id]].some(v => v?.toLowerCase().includes(term))) &&
      (filter === 'all' || (filter === 'low' && isLowStock(m)) || (filter === 'zero' && isZeroStock(m)) || (filter === 'expiring' && expiring(m)))
    );
  }, [medicines, suppliers, search, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const stockCounts = summarizeStock(medicines);
  const cards = [
    { label: 'Total Medicines', value: medicines.length, tone: 'blue', icon: 'fa-capsules' },
    { label: 'In Stock', value: medicines.filter(m => m.stock_quantity > 0).length, tone: 'green', icon: 'fa-pills' },
    { label: 'Zero Stock', value: stockCounts.zero, tone: 'red', icon: 'fa-box-open' },
    { label: 'Low Stock', value: stockCounts.low, tone: 'amber', icon: 'fa-triangle-exclamation' },
    { label: 'Expiring Soon · 30 Days', value: medicines.filter(m => expiring(m)).length, tone: 'red', icon: 'fa-calendar-days' },
  ];
  return (
    <div className="medicines-page">
      <header className="medicines-header">
        <div><p className="eyebrow">Pharmacy Inventory</p><h1>Medicines</h1></div>
        <div className="medicines-header-actions">
          <button type="button" className="secondary-btn" disabled={loading} onClick={() => setReload(v => v + 1)}>Refresh</button>
          <button type="button" className="primary-btn" aria-haspopup="dialog" aria-controls="add-medicine-dialog" onClick={() => { setAdding(true); setSaveError(''); }}><i className="fa-solid fa-plus" aria-hidden="true" /> Add Medicine</button>
        </div>
      </header>
      {notice && <p className="medicine-save-notice" role="status">{notice}</p>}
      <section className="summary-grid" aria-label="Medicine summary statistics">
        {cards.map(card => <article key={card.label} className="summary-card">
          <div className="summary-copy"><p>{card.label}</p><div className="summary-row"><strong>{loading || error ? '—' : card.value.toLocaleString()}</strong></div></div>
          <span className={`summary-icon ${card.tone}`}><i className={`fa-solid ${card.icon}`} /></span>
        </article>)}
      </section>
      <p className="stock-count-definition">Zero Stock counts catalog batches with exactly 0 available units. Low Stock counts positive quantities at or below the reorder level.</p>
      <section className="medicines-toolbar">
        <div className="search-box"><i className="fa-solid fa-magnifying-glass" /><input aria-label="Search medicines" type="search" placeholder="Search name, SKU, batch or supplier" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <div className="toolbar-actions" title="Expiring Soon counts in-stock batches expiring today through 30 days ahead; expired and zero-stock batches are excluded.">{[['all', 'All Medicines'], ['low', 'Low Stock'], ['zero', 'Zero Stock'], ['expiring', 'Expiring Soon']].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={`filter-button ${filter === key ? 'active' : ''}`} onClick={() => { setFilter(key); setPage(1); }}>{label}</button>)}</div>
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
      <dialog id="add-medicine-dialog" ref={addDialog} className="add-medicine-dialog" aria-labelledby="add-medicine-title" onClose={() => setAdding(false)} onCancel={event => { if (saveLock.current) event.preventDefault(); }}>
        {adding && <form onSubmit={addMedicine}>
          <header className="add-medicine-dialog-header"><div><p>Pharmacy Inventory</p><h2 id="add-medicine-title">Add Medicine</h2></div><button type="button" className="add-medicine-close" aria-label="Close Add Medicine" disabled={saving} onClick={() => setAdding(false)}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></header>
          <div className="add-medicine-dialog-body">
            {saveError && <p className="add-medicine-error" role="alert">{saveError}</p>}
            <fieldset disabled={saving} className="add-medicine-fields">
              {[['name','Medicine Name','text',150],['generic_name','Generic Name','text',150],['sku','SKU','text',50],['batch_number','Batch Number','text',80],['expiry_date','Expiry Date','date'],['purchase_price','Purchase Price','number'],['selling_price','Selling Price','number'],['reorder_level','Reorder Level','number']].map(([key,label,type,max]) => <label key={key}>{label}{key === 'generic_name' && ' (optional)'}<input autoFocus={key === 'name'} name={key} type={type} required={key !== 'generic_name'} maxLength={max} minLength={['name','sku'].includes(key) ? 2 : undefined} min={type === 'number' ? 0 : undefined} step={key.includes('price') ? '0.01' : type === 'number' ? '1' : undefined} defaultValue={key === 'reorder_level' ? 10 : undefined} /></label>)}
              <label>Supplier<select name="supplier_id"><option value="">No supplier</option>{Object.entries(suppliers).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            </fieldset>
            {supplierError && <p className="add-medicine-note" role="status">Supplier options are unavailable. Close this form and refresh to reload them, or save without a supplier.</p>}
            <p className="add-medicine-note">The medicine starts with zero stock. Receive stock separately before selling.</p>
          </div>
          <footer className="add-medicine-dialog-footer"><button type="button" className="secondary-btn" disabled={saving} onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save Medicine'}</button></footer>
        </form>}
      </dialog>
    </div>
  );
}
export default Medicines;
