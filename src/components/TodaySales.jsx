import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { printInvoice } from '../services/printInvoice';
import { useCurrency } from '../contexts/CurrencyContext';
import { dayKey, hasCollection, saleDate, summarizeDailySales } from '../services/dailySales';
import '../styles/TodaySales.css';

const paymentLabel = method => ({ cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer' }[method] || method || 'Not recorded');
const invoiceNumber = invoice => `INV-${String(invoice.id).padStart(6, '0')}`;
const timeLabel = invoice => saleDate(invoice.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function TodaySales({ medicines, refreshKey }) {
  const { formatMoney: money } = useCurrency();
  const [day, setDay] = useState(dayKey);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  const detailTitle = useRef(null);
  const invoiceButtons = useRef(new Map());
  const returnToInvoice = useRef(null);

  useEffect(() => {
    const refresh = () => { setDay(dayKey()); setRevision(value => value + 1); };
    const timer = window.setInterval(() => setDay(dayKey()), 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get('/sales', { signal: controller.signal, timeout: 90000 }).then(({ data }) => {
      if (!controller.signal.aborted) {
        if (!Array.isArray(data)) throw new Error('Invalid sales response');
        setSales(data);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError('Today’s invoices could not be loaded. Please retry.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, revision, day]);

  useEffect(() => {
    if (selected) detailTitle.current?.focus();
    else if (returnToInvoice.current != null) {
      invoiceButtons.current.get(returnToInvoice.current)?.focus();
      returnToInvoice.current = null;
    }
  }, [selected]);

  const summary = useMemo(() => summarizeDailySales(sales, day), [sales, day]);
  const catalog = useMemo(() => new Map(medicines.map(medicine => [medicine.id, medicine])), [medicines]);
  const invoice = summary.invoices.find(sale => sale.id === selected);
  const collected = sale => hasCollection(sale) ? money(sale.payment.amount) : 'Not recorded';
  const refresh = () => { setDay(dayKey()); setRevision(value => value + 1); };
  function openInvoices() { setSelected(null); dialog.current.showModal(); }
  function backToInvoices() { returnToInvoice.current = selected; setSelected(null); }

  return <>
    <button type="button" className="today-sales-trigger" onClick={openInvoices} aria-haspopup="dialog" aria-controls="today-sales-dialog">
      <span className="today-sales-icon"><i className="fa-solid fa-receipt" aria-hidden="true" /></span>
      <span className="today-sales-copy"><span>Sold Today</span><strong>{loading ? 'Loading…' : error ? 'Unavailable' : money(summary.total)}</strong></span>
      <span className="today-sales-caption">{loading || error ? 'View today’s invoices' : `${summary.invoices.length} ${summary.invoices.length === 1 ? 'invoice' : 'invoices'} · View collections`} <i className="fa-solid fa-chevron-right" aria-hidden="true" /></span>
    </button>
    <dialog id="today-sales-dialog" ref={dialog} className="today-sales-dialog" aria-labelledby="today-sales-title">
      <header className="today-sales-header"><div><p className="today-sales-eyebrow">{new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Completed sales</p><h2 id="today-sales-title" ref={detailTitle} tabIndex={-1}>{invoice ? invoiceNumber(invoice) : 'Today’s invoices'}</h2></div><button type="button" className="today-sales-close" aria-label="Close sales summary" onClick={() => dialog.current.close()}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></header>
      {loading ? <p className="today-sales-state" role="status">Loading today’s invoices…</p> : error ? <div className="today-sales-state" role="alert"><p>{error}</p><button type="button" onClick={refresh}>Retry</button></div> : invoice ? <>
        <button type="button" className="today-sales-back" onClick={backToInvoices}><i className="fa-solid fa-arrow-left" aria-hidden="true" /> All of today’s invoices</button>
        <button type="button" className="today-sales-refresh" onClick={() => printInvoice(invoice, medicines, money)}><i className="fa-solid fa-print" aria-hidden="true" /> Print / Save PDF</button>
        <p className="today-sales-note">No printer available? Choose “Save as PDF” in the print dialog to save this invoice.</p>
        <div className="today-sales-invoice-meta"><span>Time: <strong>{timeLabel(invoice)}</strong></span><span>Payment: <strong>{paymentLabel(invoice.payment?.method)}</strong></span><span>Status: <strong>Completed</strong></span></div>
        <div className="today-sales-table-wrap"><table className="today-sales-table"><caption className="visually-hidden">Medicines sold on {invoiceNumber(invoice)}</caption><thead><tr><th scope="col">Medicine / batch</th><th scope="col" className="today-sales-number">Qty</th><th scope="col" className="today-sales-number">Unit price</th><th scope="col" className="today-sales-number">Amount</th></tr></thead><tbody>{invoice.items.map(item => {
          const medicine = catalog.get(item.medicine_id);
          return <tr key={item.id}><td><strong>{medicine?.name || `Medicine #${item.medicine_id}`}</strong>{medicine && <small>{medicine.sku} · Batch {medicine.batch_number}</small>}</td><td className="today-sales-number">{item.quantity}</td><td className="today-sales-number">{money(item.unit_price)}</td><td className="today-sales-number">{money(item.line_total)}</td></tr>;
        })}</tbody></table></div>
        <dl className="today-sales-totals"><div><dt>Subtotal</dt><dd>{money(invoice.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(invoice.tax_amount)}</dd></div><div><dt>Invoice total</dt><dd>{money(invoice.total_amount)}</dd></div><div className="today-sales-collected"><dt>Amount collected</dt><dd>{collected(invoice)}</dd></div>{invoice.payment && <><div><dt>Amount tendered</dt><dd>{money(invoice.payment.tendered)}</dd></div><div><dt>Change returned</dt><dd>{money(invoice.payment.change)}</dd></div>{invoice.payment.reference && <div><dt>Payment reference</dt><dd>{invoice.payment.reference}</dd></div>}</>}</dl>
        {!hasCollection(invoice) && <p className="today-sales-note">This invoice has no saved payment record. Its total is not counted as confirmed collection.</p>}
      </> : <>
        <div className="today-sales-overview"><div><span>Total sold</span><strong>{money(summary.total)}</strong></div><div><span>Recorded collection</span><strong>{money(summary.collected)}</strong></div><button type="button" className="today-sales-refresh" onClick={refresh}><i className="fa-solid fa-rotate" aria-hidden="true" /> Refresh</button></div>
        {!summary.invoices.length ? <p className="today-sales-state">No completed invoices today. New sales will appear here after checkout.</p> : <div className="today-sales-table-wrap"><table className="today-sales-table"><caption className="visually-hidden">Today’s invoice-wise collections</caption><thead><tr><th scope="col">Invoice</th><th scope="col">Time</th><th scope="col">Payment</th><th scope="col" className="today-sales-number">Bill total</th><th scope="col" className="today-sales-number">Collected</th></tr></thead><tbody>{summary.invoices.map(sale => <tr key={sale.id}><td><button type="button" className="today-sales-invoice-link" ref={node => { if (node) invoiceButtons.current.set(sale.id, node); else invoiceButtons.current.delete(sale.id); }} onClick={() => setSelected(sale.id)} aria-label={`View invoice ${invoiceNumber(sale)}`}>{invoiceNumber(sale)} <i className="fa-solid fa-chevron-right" aria-hidden="true" /></button></td><td>{timeLabel(sale)}</td><td>{paymentLabel(sale.payment?.method)}</td><td className="today-sales-number">{money(sale.total_amount)}</td><td className="today-sales-number"><strong>{collected(sale)}</strong></td></tr>)}</tbody></table></div>}
        {summary.unrecorded > 0 && <p className="today-sales-note">{summary.unrecorded} {summary.unrecorded === 1 ? 'invoice has' : 'invoices have'} no saved payment record. Recorded collection excludes these invoices.</p>}
      </>}
    </dialog>
  </>;
}
