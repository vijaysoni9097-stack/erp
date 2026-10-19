import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useCurrency } from '../contexts/CurrencyContext';
import { purchaseDraftTotal, purchaseError, purchaseLineTotal, purchasePayload } from '../services/purchaseOrders';

const emptyDraft = () => ({ request_id: crypto.randomUUID(), supplier_id: '', expected_delivery: '', notes: '', items: [] });
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function NewPurchaseOrder({ open, onClose, onCreated, suppliers, medicines, loading, catalogError, onRetry }) {
  const { currency, formatMoney: money } = useCurrency();
  const dialog = useRef(null);
  const saveLock = useRef(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);
  const locked = saving || Boolean(pending);
  const catalog = useMemo(() => new Map(medicines.map(m => [m.id, m])), [medicines]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return medicines.filter(m => !draft.items.some(item => item.medicine_id === m.id) && [m.name, m.sku, m.generic_name, m.batch_number].some(value => value?.toLowerCase().includes(term))).slice(0, 20);
  }, [medicines, draft.items, search]);
  let total = null;
  try { total = purchaseDraftTotal(draft.items); } catch { /* Invalid draft remains editable. */ }

  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  const change = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setError(''); };
  function addMedicine(medicine) {
    if (locked || draft.items.length >= 100) return;
    setDraft(previous => ({ ...previous, items: [...previous.items, { medicine_id: medicine.id, quantity: '1', unit_price: Number(medicine.purchase_price).toFixed(2) }] }));
    setSearch(''); setError('');
  }
  function changeItem(id, key, value) {
    setDraft(previous => ({ ...previous, items: previous.items.map(item => item.medicine_id === id ? { ...item, [key]: value } : item) }));
    setError('');
  }
  async function save(event) {
    event.preventDefault();
    if (saveLock.current) return;
    let payload;
    try { payload = pending || purchasePayload(draft, currency); }
    catch (err) { setError(err.message); return; }
    saveLock.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post('/purchase-orders', payload, { timeout: 90000 });
      setPending(null); setDraft(emptyDraft()); setSearch('');
      dialog.current.close(); onCreated(data);
    } catch (err) {
      setError(purchaseError(err));
      if (!err.response || err.response.status >= 500 || err.code === 'ECONNABORTED') setPending(payload);
      else setPending(null);
    } finally { saveLock.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="purchase-order-dialog" aria-labelledby="new-purchase-order-title" onClose={onClose} onCancel={event => { if (saveLock.current) event.preventDefault(); else onClose(); }}>
    <form onSubmit={save}>
      <header className="purchase-order-modal-header"><div><p>Procurement</p><h2 id="new-purchase-order-title">New Purchase Order</h2></div><button type="button" disabled={saving} className="purchase-order-icon-button" aria-label="Close new purchase order" onClick={onClose}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></header>
      <div className="purchase-order-form-body">
        <p className="purchase-order-note">Create an order for approval. Stock is updated separately when goods are received.</p>
        {loading ? <p role="status">Loading suppliers and medicines…</p> : catalogError ? <p role="alert">{catalogError} <button type="button" onClick={onRetry}>Retry</button></p> : !suppliers.length || !medicines.length ? <p role="status">{!suppliers.length ? <>Add a <Link to="/suppliers" onClick={onClose}>supplier</Link></> : <>Add a <Link to="/medicines" onClick={onClose}>medicine</Link></>} before creating a purchase order.</p> : null}
        <fieldset disabled={locked || loading || Boolean(catalogError)}>
          <div className="purchase-order-fields">
            <label>Supplier <span aria-hidden="true">*</span><select autoFocus required value={draft.supplier_id} onChange={event => change('supplier_id', event.target.value)}><option value="">Select a supplier</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <label>Expected delivery<input type="date" min={localToday()} value={draft.expected_delivery} onChange={event => change('expected_delivery', event.target.value)} /></label>
          </div>
          <section className="purchase-order-add-items" aria-labelledby="purchase-order-medicines-title"><h3 id="purchase-order-medicines-title">Medicines <span>{draft.items.length} / 100</span></h3><label>Find a medicine<input type="search" placeholder="Search medicine name, SKU or batch" value={search} onChange={event => setSearch(event.target.value)} disabled={locked || draft.items.length >= 100 || loading || Boolean(catalogError)} /></label>
            {search.trim() && <ul className="purchase-order-search-results">{matches.map(medicine => <li key={medicine.id}><button type="button" onClick={() => addMedicine(medicine)}><span><strong>{medicine.name}</strong><small>{medicine.sku} · Batch {medicine.batch_number}</small></span><span>Add <i className="fa-solid fa-plus" aria-hidden="true" /></span></button></li>)}{!matches.length && <li className="purchase-order-note">No matching medicines. Try a different name or SKU.</li>}</ul>}
          </section>
          {!draft.items.length ? <p className="purchase-order-empty">Search and add at least one medicine to begin.</p> : <div className="table-scroll"><table className="purchase-order-lines"><caption className="visually-hidden">Purchase order medicines</caption><thead><tr><th scope="col">Medicine</th><th scope="col">Quantity</th><th scope="col">Unit cost ({currency})</th><th scope="col">Amount</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead><tbody>{draft.items.map(item => {
            const medicine = catalog.get(item.medicine_id); let amount = null;
            try { amount = purchaseLineTotal(item) / 100; } catch { /* Show no amount until valid. */ }
            return <tr key={item.medicine_id}><td><strong>{medicine?.name || `Medicine #${item.medicine_id}`}</strong><small>{medicine?.sku} · {medicine?.batch_number}</small></td><td><input type="number" aria-label={`Quantity for ${medicine?.name}`} required min="1" max="2147483647" step="1" value={item.quantity} onChange={event => changeItem(item.medicine_id, 'quantity', event.target.value)} /></td><td><input type="number" aria-label={`Unit cost for ${medicine?.name}`} required min="0" step="0.01" max="9999999999.99" value={item.unit_price} onChange={event => changeItem(item.medicine_id, 'unit_price', event.target.value)} /></td><td className="purchase-orders-price">{amount === null ? '—' : money(amount)}</td><td><button type="button" className="purchase-order-icon-button" aria-label={`Remove ${medicine?.name}`} onClick={() => change('items', draft.items.filter(line => line.medicine_id !== item.medicine_id))}><i className="fa-solid fa-trash-can" aria-hidden="true" /></button></td></tr>;
          })}</tbody></table></div>}
          <label className="purchase-order-notes">Notes (optional)<textarea maxLength={1000} rows={3} value={draft.notes} onChange={event => change('notes', event.target.value)} placeholder="Delivery instructions or supplier reference" /></label>
        </fieldset>
        {error && <p className="purchase-order-error" role="alert">{error}</p>}
        {pending && <p className="purchase-order-note">The save is awaiting confirmation. Retry this same order to avoid creating a duplicate. You can close this dialog and resume it with New Purchase Order.</p>}
      </div>
      <footer className="purchase-order-modal-footer"><div><span>Estimated total</span><strong>{total === null ? '—' : money(total)}</strong></div><button type="button" className="filter-button" disabled={saving} onClick={onClose}>{pending ? 'Close for now' : 'Cancel'}</button><button type="submit" className="purchase-order-save" disabled={saving || (!pending && (loading || Boolean(catalogError) || !draft.items.length || !draft.supplier_id || total === null || !/^[A-Z]{3}$/.test(currency)))}>{saving ? 'Saving…' : pending ? 'Retry / confirm order' : 'Create Purchase Order'}</button></footer>
    </form>
  </dialog>;
}
