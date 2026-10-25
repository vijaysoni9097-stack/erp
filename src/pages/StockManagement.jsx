import React, { useEffect, useRef, useState } from 'react';
import { summarizeStock } from '../services/stockSummary';
import { api } from '../services/api';
import '../styles/StockManagement.css';
import ReceiveStock from '../components/ReceiveStock';

export default function StockManagement() {
  const [data, setData] = useState({ items: [] });
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expiryFrom, setExpiryFrom] = useState('');
  const [expiryTo, setExpiryTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState('decrease');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('Damaged');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const saveLock = useRef(false);
  const amount = Number(quantity);
  const nextQuantity = selected ? selected.allocated_quantity + (direction === 'increase' ? amount : -amount) : 0;
  function openAdjustment(row) {
    setSelected(row); setDirection('decrease'); setQuantity(''); setReason('Damaged');
    setNote(''); setAdjustError(''); setNotice('');
    dialog.current.showModal();
  }
  async function adjustStock(event) {
    event.preventDefault();
    if (saveLock.current || !selected) return;
    if (!Number.isSafeInteger(amount) || amount <= 0 || nextQuantity < 0) {
      setAdjustError('Enter a positive whole quantity. Stock cannot become negative.'); return;
    }
    if (!reason || (reason === 'Other' && !note.trim())) {
      setAdjustError('Select a reason and add details for Other.'); return;
    }
    saveLock.current = true; setSaving(true); setAdjustError('');
    try {
      const { data: medicine } = await api.post(`/medicines/${selected.medicine_id}/stock`, {
        quantity_change: direction === 'increase' ? amount : -amount,
        note: `${reason}${note.trim() ? ': ' + note.trim() : ''}`,
      });
      setMedicines(previous => previous.map(row => row.id === medicine.id ? medicine : row));
      setData(previous => ({ ...previous, items: previous.items.map(row => row.medicine_id === medicine.id
        ? { ...row, allocated_quantity: medicine.stock_quantity } : row) }));
      setNotice(`${selected.name}: stock ${direction === 'increase' ? 'increased' : 'decreased'} by ${amount.toLocaleString()}. Available on device: ${medicine.stock_quantity.toLocaleString()}.`);
      dialog.current.close(); setSelected(null);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setAdjustError(typeof detail === 'string' ? detail : 'Could not confirm the adjustment. Close this form and refresh stock before retrying; the change may have been saved.');
    } finally { saveLock.current = false; setSaving(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([api.get('/inventory/source-stock', { signal: controller.signal, timeout:90000 }), api.get('/medicines', { signal:controller.signal, timeout:90000 })]).then(([snapshot,catalog]) => {
      if (!controller.signal.aborted) { setData(snapshot.data); setMedicines(catalog.data); setPage(1); }
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load stock. Check the local service and retry.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const catalog = new Map(medicines.map(m=>[m.id,m]));
  const stockCounts = summarizeStock(medicines);
  const rows = data.items.map(row => {
    const medicine = catalog.get(row.medicine_id);
    return {...row, medicine_id:medicine?.id ?? null, allocated_quantity:medicine?.stock_quantity ?? null,
      current_quantity:medicine?.stock_quantity ?? null};
  });
  const invalidExpiryRange = Boolean(expiryFrom && expiryTo && expiryFrom > expiryTo);
  const filtered = rows.filter(r => !invalidExpiryRange &&
    ((!expiryFrom && !expiryTo) || (r.expiry_date && (!expiryFrom || r.expiry_date >= expiryFrom) && (!expiryTo || r.expiry_date <= expiryTo))) && `${r.name} ${r.source_id}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === 'all' || (filter === 'positive' && r.current_quantity > 0) || (filter === 'zero' && r.current_quantity === 0) || (filter === 'review' && (r.current_quantity === null || r.current_quantity < 0 || r.medicine_id === null))));
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.min(page, pages);
  const cards = [
    ['Available Stock Units (Net)', stockCounts.units, 'blue', 'fa-cubes'],
    ['Items with Stock', stockCounts.positive, 'green', 'fa-circle-check'],
    ['Zero Stock', stockCounts.zero, 'amber', 'fa-triangle-exclamation'],
    ['Negative / Missing Stock', rows.filter(r => r.current_quantity === null || r.current_quantity < 0).length, 'red', 'fa-bell'],
  ];
  return <div className="inventory-page">
    <header className="inventory-header"><div><p className="eyebrow">Inventory</p><h1>Stock Management</h1></div><div className="panel-head-actions"><ReceiveStock onReceived={message => { setNotice(message); setReload(v => v + 1); }} /><button className="secondary-btn" disabled={loading} onClick={() => setReload(v => v + 1)}>Refresh</button></div></header>
    {notice && <p className="stock-notice" role="status">{notice}</p>}
    <section className="summary-grid" aria-label="Stock summary">{cards.map(([label, value, tone, icon]) => <article key={label} className="summary-card"><div className="summary-copy"><p>{label}</p><div className="summary-row"><strong>{loading || error ? '—' : value.toLocaleString()}</strong></div></div><span className={`summary-icon ${tone}`}><i className={`fa-solid ${icon}`} /></span></article>)}</section>
    <p className="stock-count-definition">Counts use current catalog stock, matching Medicines. Imported backup quantities are reference only; unimported records are excluded from Zero Stock.</p>
    <section className="inventory-panel"><div className="panel-head stock-inventory-toolbar"><div className="stock-inventory-heading"><h2>Stock Inventory</h2>
    <div className="stock-expiry-filters" role="group" aria-label="Filter by expiry date">
      <label>Expiry from<input type="date" value={expiryFrom} max={expiryTo || undefined} onChange={e => { setExpiryFrom(e.target.value); setPage(1); }} /></label>
      <label>Expiry to<input type="date" value={expiryTo} min={expiryFrom || undefined} onChange={e => { setExpiryTo(e.target.value); setPage(1); }} /></label>
      {(expiryFrom || expiryTo) && <button type="button" className="ghost-btn" onClick={() => { setExpiryFrom(''); setExpiryTo(''); setPage(1); }} aria-label="Clear expiry dates" title="Clear expiry dates">Clear</button>}
      {invalidExpiryRange && <p role="alert">Expiry from must be on or before expiry to.</p>}
    </div>
    </div><div className="panel-head-actions">
      <input aria-label="Search stock" placeholder="Search medicine or item code" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <select aria-label="Stock filter" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">All Items</option><option value="positive">With Stock</option><option value="zero">Zero Stock</option><option value="review">Needs Review</option></select>
    </div></div>
    {loading ? <p role="status">Loading stock…</p> : error ? <p role="alert">{error} <button onClick={() => setReload(v => v + 1)}>Retry</button></p> : <>
    <div className="table-wrap"><table className="inventory-table"><thead><tr><th>Medicine</th><th>Item Code</th><th>Recorded Qty</th><th>Available on Device</th><th>Expiry Date</th><th>Last Updated</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {filtered.slice((current - 1) * 50, current * 50).map(r => <tr key={r.source_id}><td><strong>{r.name}</strong></td><td>{r.source_id}</td><td>{r.quantity === null ? 'No record' : r.quantity.toLocaleString()}</td><td>{r.allocated_quantity ?? 'Not imported'}</td><td>{r.expiry_date ? new Date(`${r.expiry_date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded'}</td><td>{r.source_modified_on ? new Date(r.source_modified_on).toLocaleDateString() : '—'}</td><td>{r.current_quantity === null ? 'Missing stock record' : r.current_quantity < 0 ? 'Negative — review' : r.medicine_id === null ? 'Catalog not imported' : r.current_quantity === 0 ? 'Zero Stock' : 'In Stock'}</td><td><button className="table-action" disabled={r.medicine_id == null || !Number.isSafeInteger(r.allocated_quantity)} title={r.medicine_id == null ? 'Import this item into the catalog first' : 'Adjust stock available on this device'} onClick={() => openAdjustment(r)}>Adjust Stock</button></td></tr>)}
    {!filtered.length && <tr><td colSpan={8}>No items match your search or filter.</td></tr>}
    </tbody></table></div><div className="panel-head"><span>{filtered.length.toLocaleString()} items · Page {current} of {pages}</span><div className="panel-head-actions"><button className="ghost-btn" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><button className="ghost-btn" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </>}
    </section>
    <dialog ref={dialog} className="stock-adjust-dialog" aria-labelledby="adjust-stock-title" onCancel={event => { if (saveLock.current) event.preventDefault(); }}>
      <form onSubmit={adjustStock}>
        <h2 id="adjust-stock-title">Adjust Stock</h2>
        <p><strong>{selected?.name}</strong> · {selected?.source_id}</p>
        <p>Available on device: <strong>{selected?.allocated_quantity?.toLocaleString()}</strong>. Recorded backup quantity is unchanged.</p>
        <label>Adjustment type<select autoFocus value={direction} disabled={saving} onChange={event => { setDirection(event.target.value); setReason(''); }}><option value="decrease">Decrease stock (−)</option><option value="increase">Increase stock (+)</option></select></label>
        <label>Quantity<input type="number" min="1" step="1" max={direction === 'decrease' ? Math.max(1, selected?.allocated_quantity ?? 0) : undefined} required value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)} /></label>
        <label>Reason<select required value={reason} disabled={saving} onChange={event => setReason(event.target.value)}><option value="">Select a reason</option>{(direction === 'decrease' ? ['Damaged', 'Stolen', 'Rat / pest damage', 'Expired', 'Stock count correction', 'Other'] : ['Stock found', 'Stock count correction', 'Other']).map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Details {reason === 'Other' ? '(required)' : '(optional)'}<textarea maxLength={450} required={reason === 'Other'} value={note} disabled={saving} onChange={event => setNote(event.target.value)} /></label>
        {Number.isSafeInteger(amount) && amount > 0 && <p role="status">Stock after adjustment: <strong>{nextQuantity.toLocaleString()}</strong></p>}
        {adjustError && <p role="alert" className="stock-adjust-error">{adjustError}</p>}
        <div className="stock-adjust-actions"><button type="button" className="secondary-btn" disabled={saving} onClick={() => { dialog.current.close(); setSelected(null); }}>Cancel</button><button className="primary-btn" type="submit" disabled={saving || !Number.isSafeInteger(amount) || amount <= 0 || nextQuantity < 0}>{saving ? 'Saving…' : 'Save Adjustment'}</button></div>
      </form>
    </dialog>
  </div>;
}
