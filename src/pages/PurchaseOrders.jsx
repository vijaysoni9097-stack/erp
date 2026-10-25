import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { api } from '../services/api';
import { purchaseDate, purchaseError, purchaseOrderNumber, purchaseStatus } from '../services/purchaseOrders';
import NewPurchaseOrder from '../components/NewPurchaseOrder';
import '../styles/dashboard.css';
import '../styles/PurchaseOrders.css';

export default function PurchaseOrders({ title = 'Purchase Orders', profile }) {
  const { formatMoney, currency, locale } = useCurrency();
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const canApprove = ['admin', 'superadmin'].includes(profile?.role);
  const [filter, setFilter] = useState(canApprove ? 'pending_approval' : 'all');
  const [quantities, setQuantities] = useState({});
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [page, setPage] = useState(1);
  const detailDialog = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get('/purchase-orders', { signal: controller.signal, timeout: 90000 }).then(({ data }) => {
      if (!Array.isArray(data)) throw new Error('Invalid purchase order list');
      if (!controller.signal.aborted) setOrders(data);
    }).catch(err => { if (!controller.signal.aborted) setError(err.response?.status === 404 ? 'The purchase order service is not available. Restart the updated backend and retry.' : err.response ? purchaseError(err) : 'Could not load purchase orders. Check the service and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    Promise.all([api.get('/suppliers', { signal: controller.signal, timeout: 90000 }), api.get('/medicines', { signal: controller.signal, timeout: 90000 })])
      .then(([supplierList, catalog]) => { if (!controller.signal.aborted) { setSuppliers(supplierList.data); setMedicines(catalog.data); } })
      .catch(() => { if (!controller.signal.aborted) setCatalogError('Suppliers and medicines could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => { if (params.get('new') === '1') setShowNew(true); }, [params]);
  useEffect(() => { if (selected) { setQuantities(Object.fromEntries(selected.items.map(item => [item.id, item.quantity]))); setApprovalError(''); if (!detailDialog.current.open) detailDialog.current.showModal(); } }, [selected]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(order => (filter === 'all' || order.status === filter) && (!term || [purchaseOrderNumber(order.id), order.supplier_name, ...order.items.flatMap(item => [item.medicine_name, item.sku])].some(value => value.toLowerCase().includes(term))));
  }, [orders, search, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  const now = new Date();
  const thisMonth = orders.filter(order => { const created = purchaseDate(order.created_at); return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear() && order.currency === currency && order.status !== 'cancelled'; });
  const monthTotal = thisMonth.reduce((sum, order) => sum + Math.round(Number(order.total_amount) * 100), 0) / 100;
  const stats = [
    { title: 'Total Orders', value: orders.length.toLocaleString(), icon: 'cart-shopping', tone: 'blue' },
    { title: 'Pending Approval', value: orders.filter(order => order.status === 'pending_approval').length.toLocaleString(), icon: 'hourglass', tone: 'yellow' },
    { title: 'Units Ordered', value: orders.filter(order => order.status !== 'cancelled').reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0).toLocaleString(), icon: 'boxes-stacked', tone: 'green' },
    { title: `Ordered This Month (${currency})`, value: formatMoney(monthTotal), icon: 'money-bill-wave', tone: 'sky' },
  ];
  const orderMoney = (value, order) => new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency }).format(Number(value));
  function closeNew() {
    setShowNew(false);
    if (params.has('new')) { const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true }); }
  }
  function created(order) {
    closeNew(); setNotice(`${purchaseOrderNumber(order.id)} created and awaiting approval.`);
    setOrders(previous => [order, ...previous.filter(item => item.id !== order.id)]);
    setSelected(order); setSearch(''); setFilter('all'); setPage(1); setReload(value => value + 1);
  }
  async function approve() {
    if (approving) return;
    if (selected.items.some(item => !/^[1-9]\d*$/.test(String(quantities[item.id])) || Number(quantities[item.id]) > 2147483647)) { setApprovalError('Enter a positive whole quantity for every medicine.'); return; }
    setApproving(true); setApprovalError('');
    try {
      const { data } = await api.post(`/purchase-orders/${selected.id}/approve`, { items: selected.items.map(item => ({ order_item_id: item.id, quantity: Number(quantities[item.id]) })) });
      setOrders(previous => previous.map(order => order.id === data.id ? data : order)); setSelected(data);
      setNotice(`${purchaseOrderNumber(data.id)} approved. Stock changes only when received.`);
    } catch (err) { setApprovalError(purchaseError(err)); } finally { setApproving(false); }
  }
  return <section className="dashboard-page purchase-orders-page">
    <header className="dashboard-header"><div className="purchase-orders-title"><h1>{title}</h1><span className="purchase-orders-count">{loading || error ? '—' : orders.length.toLocaleString()} total orders</span></div><div className="dashboard-buttons"><button type="button" className="stock-btn" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh</button><button type="button" className="purchase-btn" onClick={() => setShowNew(true)}><i className="fa-solid fa-plus" aria-hidden="true" /> New Purchase Order</button></div></header>
    {canApprove && <p className="purchase-order-note">Admin approval queue: {orders.filter(order => order.status === 'pending_approval').length} awaiting your review. Open an order to adjust quantities and approve.</p>}
    {notice && <p role="status" className="purchase-order-success">{notice}</p>}
    <section className="dashboard-cards" aria-label="Purchase order summary">{stats.map(stat => <article className="dashboard-card" key={stat.title}><p className="stat-label">{stat.title}</p><div className="stat-value-row"><strong>{loading || error ? '—' : stat.value}</strong></div><span className={`stat-icon ${stat.tone}`}><i className={`fa-solid fa-${stat.icon}`} aria-hidden="true" /></span></article>)}</section>
    <section className="dashboard-panel" aria-labelledby="purchase-order-list-title"><div className="panel-header"><h2 id="purchase-order-list-title">Purchase Order List</h2><div className="purchase-order-list-tools"><input type="search" aria-label="Search purchase orders" placeholder="Search order, supplier or medicine" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Filter purchase orders by status" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option>{[...new Set(['pending_approval', ...orders.map(order => order.status)])].map(status => <option key={status} value={status}>{purchaseStatus(status)}</option>)}</select></div></div>
      {loading ? <p className="purchase-order-empty" role="status">Loading purchase orders…</p> : error ? <p className="purchase-order-empty purchase-order-error" role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Retry</button></p> : <><div className="table-scroll"><table className="dashboard-table purchase-orders-table" aria-label="Purchase orders"><thead><tr><th scope="col">PO ID</th><th scope="col">Supplier</th><th scope="col">Medicines</th><th scope="col">Created</th><th scope="col">Expected delivery</th><th scope="col">Status</th><th scope="col" className="purchase-orders-price">Estimated total</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 25, currentPage * 25).map(order => <tr key={order.id}><td><button type="button" className="purchase-order-link" onClick={() => setSelected(order)}>{purchaseOrderNumber(order.id)}</button></td><td>{order.supplier_name}</td><td>{order.items.length} {order.items.length === 1 ? 'medicine' : 'medicines'} · {order.items.reduce((n, item) => n + item.quantity, 0)} units</td><td>{purchaseDate(order.created_at).toLocaleDateString()}</td><td>{order.expected_delivery ? new Date(`${order.expected_delivery}T12:00:00`).toLocaleDateString() : 'Not specified'}</td><td><span className={`purchase-order-status ${order.status}`}>{purchaseStatus(order.status)}</span></td><td className="purchase-orders-price"><strong>{orderMoney(order.total_amount, order)}</strong></td></tr>)}{!filtered.length && <tr><td colSpan={7} className="purchase-order-empty">{orders.length ? 'No orders match your search or filter.' : 'No purchase orders yet. Create your first order to get started.'}</td></tr>}</tbody></table></div><div className="purchase-order-pagination"><span>{filtered.length} orders · Page {currentPage} of {pages}</span><div><button type="button" className="filter-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="filter-button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></>}
    </section>
    <NewPurchaseOrder open={showNew} onClose={closeNew} onCreated={created} suppliers={suppliers} medicines={medicines} loading={catalogLoading} catalogError={catalogError} onRetry={() => setReload(value => value + 1)} />
    <dialog ref={detailDialog} className="purchase-order-dialog" aria-labelledby="purchase-order-detail-title" onClose={() => setSelected(null)} onCancel={() => setSelected(null)}>{selected && <><header className="purchase-order-modal-header"><div><p>Purchase Order</p><h2 id="purchase-order-detail-title">{purchaseOrderNumber(selected.id)}</h2></div><button type="button" className="purchase-order-icon-button" aria-label="Close purchase order details" onClick={() => detailDialog.current.close()}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></header><div className="purchase-order-form-body"><dl className="purchase-order-detail-meta"><div><dt>Supplier</dt><dd>{selected.supplier_name}</dd></div><div><dt>Status</dt><dd>{purchaseStatus(selected.status)}</dd></div><div><dt>Created</dt><dd>{purchaseDate(selected.created_at).toLocaleString()}</dd></div><div><dt>Expected delivery</dt><dd>{selected.expected_delivery || 'Not specified'}</dd></div><div><dt>Currency</dt><dd>{selected.currency}</dd></div></dl><div className="table-scroll"><table className="purchase-order-lines"><caption className="visually-hidden">Saved purchase order medicines</caption><thead><tr><th scope="col">Medicine</th><th scope="col">Quantity</th><th scope="col">Unit cost</th><th scope="col">Amount</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.id}><td><strong>{item.medicine_name}</strong><small>{item.sku} · Batch {item.batch_number}</small></td><td>{canApprove && selected.status === 'pending_approval' ? <input aria-label={`Approved quantity for ${item.medicine_name}`} type="number" min="1" max="2147483647" step="1" value={quantities[item.id] ?? item.quantity} disabled={approving} onChange={event => setQuantities(previous => ({ ...previous, [item.id]: event.target.value }))} /> : item.quantity}</td><td>{orderMoney(item.unit_price, selected)}</td><td>{orderMoney(canApprove && selected.status === 'pending_approval' ? Number(quantities[item.id] ?? item.quantity) * Number(item.unit_price) : item.line_total, selected)}</td></tr>)}</tbody></table></div>{selected.notes && <p className="purchase-order-saved-notes"><strong>Notes</strong>{selected.notes}</p>}<p className="purchase-order-note">{selected.status === 'pending_approval' ? 'Pending with Admin. An admin or superadmin must review quantities and approve before receiving.' : 'Awaiting supplier delivery. An admin must review batch, expiry, units and prices in Stock Management → Review Delivery, then approve delivery to update medicines.'}</p></div><footer className="purchase-order-modal-footer">{approvalError && <p role="alert" className="purchase-order-error">{approvalError}</p>}{canApprove && selected.status === 'pending_approval' && <button type="button" className="purchase-btn" disabled={approving} onClick={approve}>{approving ? 'Approving…' : 'Save quantities & approve'}</button>}<div><span>Estimated total</span><strong>{orderMoney(canApprove && selected.status === 'pending_approval' ? selected.items.reduce((sum, item) => sum + Number(quantities[item.id] ?? item.quantity) * Number(item.unit_price), 0) : selected.total_amount, selected)}</strong></div><button type="button" className="filter-button" onClick={() => detailDialog.current.close()}>Close</button></footer></>}</dialog>
  </section>;
}
