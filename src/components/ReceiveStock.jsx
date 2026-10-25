import { useId, useRef, useState } from 'react';
import { api } from '../services/api';

export default function ReceiveStock({ onReceived, medicines = [], orderId, label = 'Review Delivery' }) {
  const titleId = useId();
  const dialog = useRef(null);
  const lock = useRef(false);
  const request = useRef(null);
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [details, setDetails] = useState({});
  const [closeOrder, setCloseOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const { data } = await api.get('/purchase-orders/pending-receipt'); setOrders(data); if (orderId) { const selected = data.find(item => item.id === orderId); if (selected) selectOrder(orderId, data); else setError('This order is not awaiting delivery. Refresh its status first.'); } }
    catch { setError('Could not load pending orders. Please retry.'); }
    finally { setLoading(false); }
  }
  function open() {
    setOrder(null); setUncertain(false); request.current = null;
    dialog.current.showModal(); load();
  }
  function selectOrder(value, list = orders) {
    const selected = list.find(item => item.id === Number(value));
    setOrder(selected || null); setCloseOrder(false); setError(''); request.current = null;
    setDetails(Object.fromEntries((selected?.items || []).map(item => { const medicine = medicines.find(m => m.id === item.medicine_id); return [item.id, { batch_number: item.batch_number, expiry_date: medicine?.expiry_date || '', unit: medicine?.unit || 'number', purchase_price: item.unit_price, selling_price: medicine?.selling_price || '' }]; })));
    setQuantities(Object.fromEntries((selected?.items || []).map(item => [item.id, String(item.remaining_quantity)])));
  }
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !order) return;
    const items = order.items.map(item => ({ order_item_id: item.id, quantity: Number(quantities[item.id]), ...details[item.id] }));
    if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 2147483647) || !items.some(item => item.quantity > 0)) {
      setError('Enter whole quantities of zero or more, with at least one unit received.'); return;
    }
    request.current ||= { request_id: crypto.randomUUID(), items, close_order: closeOrder };
    lock.current = true; setBusy(true); setError('');
    try {
      await api.post(`/purchase-orders/${order.id}/receipts`, request.current);
      window.dispatchEvent(new Event('erp:data-saved'));
      dialog.current.close(); onReceived(`Stock received against PO #${order.id}. Medicine quantities updated.`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setUncertain(!err.response || err.response.status >= 500);
      if (err.response && err.response.status < 500) request.current = null;
      setError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(item => item.msg).join(' ') : 'Receipt could not be confirmed. Retry the same receipt safely, or close and refresh before starting another.');
    } finally { lock.current = false; setBusy(false); }
  }
  return <><button type="button" className="primary-btn" onClick={open}>{label}</button>
    <dialog ref={dialog} className="stock-adjust-dialog delivery-review-dialog" aria-labelledby={titleId} onCancel={event => { if (lock.current) event.preventDefault(); }}>
      <form onSubmit={submit}><h2 id={titleId}>Admin Delivery Review</h2>
        {loading ? <p role="status">Loading pending orders…</p> : <label>Pending purchase order<select value={order?.id || ''} disabled={busy || uncertain || Boolean(orderId)} onChange={event => selectOrder(event.target.value)}><option value="">Select a PO</option>{orders.map(item => <option key={item.id} value={item.id}>PO #{item.id} · {item.supplier_name}</option>)}</select></label>}
        {!loading && !orders.length && !error && <p>No purchase orders are pending receipt.</p>}
        {order && <><p>Check each delivered medicine against the supplier bill. Enter actual units, batch, expiry and prices per unit. Use zero for undelivered items. Confirming adds sellable stock automatically.</p><div style={{ overflowX: 'auto' }}><table className="inventory-table"><thead><tr><th>Medicine / batch</th><th>Ordered</th><th>Already received</th><th>Receive now</th><th>Delivery details</th></tr></thead><tbody>{order.items.map(item => <tr key={item.id}><td>{item.medicine_name}<small style={{ display: 'block' }}>{item.sku} · {item.batch_number}</small></td><td>{item.quantity}</td><td>{item.received_quantity}</td><td><input aria-label={`Receive ${item.medicine_name}`} type="number" min="0" max="2147483647" step="1" required value={quantities[item.id] ?? ''} disabled={busy || uncertain} onChange={event => { request.current = null; setQuantities(previous => ({ ...previous, [item.id]: event.target.value })); }} /></td><td><div className="delivery-review-fields">{[['batch_number','Batch','text'],['expiry_date','Expiry','date'],['unit','Unit (tablet, bottle, syrup, number…)','text'],['purchase_price','Purchase cost / unit','number'],['selling_price','Selling price / unit','number']].map(([key,label,type]) => <label key={key}>{label}<input aria-label={`${label} for ${item.medicine_name}`} type={type} required={Number(quantities[item.id]) > 0} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} maxLength={key === 'unit' ? 30 : key === 'batch_number' ? 80 : undefined} value={details[item.id]?.[key] ?? ''} disabled={busy || uncertain || Number(quantities[item.id]) === 0} onChange={event => { request.current = null; setDetails(previous => ({...previous, [item.id]: {...previous[item.id], [key]: event.target.value}})); }} /></label>)}</div></td></tr>)}</tbody></table></div><label><input type="checkbox" checked={closeOrder} disabled={busy || uncertain} onChange={event => { request.current = null; setCloseOrder(event.target.checked); }} /> Final delivery — close any remaining quantities</label></>}
        {error && <p role="alert">{error}</p>}
        {!order && error && <button type="button" onClick={load} disabled={loading}>Retry loading</button>}
        <div className="stock-adjust-actions"><button type="button" className="secondary-btn" disabled={busy} onClick={() => dialog.current.close()}>Cancel</button><button type="submit" className="primary-btn" disabled={busy || loading || !order}>{busy ? 'Confirming…' : uncertain ? 'Retry same receipt' : 'Approve delivery & add stock'}</button></div>
      </form>
    </dialog></>;
}
