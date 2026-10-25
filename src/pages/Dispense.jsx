import { useCurrency } from '../contexts/CurrencyContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import TodaySales from '../components/TodaySales';
import BillingDetails from '../components/BillingDetails';
import '../styles/StockManagement.css';
import { dayKey } from '../services/dailySales';
import { validDiscount, readDailyDiscount, saveDailyDiscount, applyBillDiscount } from '../services/dailyDiscount';
import { discountLine } from '../services/discounts';
import { printInvoice } from '../services/printInvoice';
import '../styles/Dispense.css';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const available = medicine => medicine.stock_quantity > 0 && medicine.expiry_date >= today();
function errorText(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(e => e.msg).join(' ') : 'The service did not confirm this sale. Retry the same bill to check it safely.';
}

export default function Dispense({profile}) {
  const { formatMoney: money } = useCurrency();
  const [medicines, setMedicines] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [doctorError, setDoctorError] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [discountDay, setDiscountDay] = useState(dayKey);
  const [dailyDiscount, setDailyDiscount] = useState('');
  const [dailyDraft, setDailyDraft] = useState('');
  const [customerDiscount, setCustomerDiscount] = useState('');
  const [discountNotice, setDiscountNotice] = useState('');
  const [patient, setPatient] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [pending, setPending] = useState(null);
  const submitting = useRef(false);
  const billRef = useRef(null);
  const receiptRef = useRef(null);

  useEffect(() => {
    if (receipt) receiptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [receipt]);
  const locked = busy || Boolean(pending);

  useEffect(() => {
    const checkDay = () => setDiscountDay(dayKey());
    const timer = setInterval(checkDay, 30000);
    window.addEventListener('focus', checkDay);
    return () => { clearInterval(timer); window.removeEventListener('focus', checkDay); };
  }, []);
  useEffect(() => {
    let value = '';
    try { value = readDailyDiscount(window.localStorage, profile.id, discountDay); } catch { /* Storage may be disabled. */ }
    setDailyDiscount(value);setDailyDraft(value);setCustomerDiscount('');setDiscountNotice('');
  }, [profile.id, discountDay]);

  function setTodaysDiscount() {
    if (locked || !validDiscount(dailyDraft)) return;
    const value = String(Number(dailyDraft));
    let stored = false;
    try { stored = saveDailyDiscount(window.localStorage, profile.id, dayKey(), value); } catch { /* Keep working in this session. */ }
    setDiscountDay(dayKey());setDailyDiscount(value);setDailyDraft(value);setCustomerDiscount('');
    setCart(items => applyBillDiscount(items, value));setPaymentConfirmed(false);
    setDiscountNotice(stored ? `Default ${value}% saved and applied.` : 'Discount applied. Browser storage is unavailable; re-enter it after reloading.');
  }
  function changeCustomerDiscount(value) {
    if (locked) return;
    setCustomerDiscount(value);setPaymentConfirmed(false);
    const effective = value === '' ? dailyDiscount : value;
    if (validDiscount(effective)) setCart(items => applyBillDiscount(items, effective));
    setDiscountNotice('Customer override applies to this bill only.');
  }
  const effectiveDiscount = customerDiscount === '' ? dailyDiscount : customerDiscount;
  const discountReady = validDiscount(dailyDiscount) && validDiscount(effectiveDiscount);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setDoctorError(false);
    Promise.allSettled([
      api.get('/medicines', {signal:controller.signal,timeout:90000}),
      api.get('/sales/prescribers', {signal:controller.signal,timeout:90000}),
    ]).then(([catalog,prescribers]) => {
      if(controller.signal.aborted) return;
      if(catalog.status === 'fulfilled') setMedicines(catalog.value.data);
      else setLoadError('Medicine stock could not be loaded. Please refresh to try again.');
      if(prescribers.status === 'fulfilled') setDoctors(prescribers.value.data);
      else setDoctorError(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!cart.length && !pending) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [cart.length, pending]);

  const stock = useMemo(() => new Map(medicines.map(m => [m.id,m])), [medicines]);
  const sellable = useMemo(() => medicines.filter(available), [medicines]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sellable.filter(m => [m.name,m.generic_name,m.sku,m.batch_number].some(v => v?.toLowerCase().includes(term)));
  }, [sellable,search]);
  const units = cart.reduce((n,item) => n+Number(item.quantity || 0),0);
  const grossTotal = cart.reduce((sum,item)=>sum+Math.round(Number(stock.get(item.id)?.selling_price||0)*100)*item.quantity,0)/100;
  const total = cart.reduce((sum,item)=>sum+Math.round((discountLine(stock.get(item.id)?.selling_price||0,item.quantity,item.discount_percent)?.total||0)*100),0)/100;
  const totalDiscount = Math.round((grossTotal-total)*100)/100;
  const tendered = paymentMethod === 'cash' ? Number(cashReceived) : total;
  const paymentValid = paymentConfirmed && (paymentMethod === 'cash' ? cashReceived !== '' && Number.isFinite(tendered) && Math.round(tendered*100)>=Math.round(total*100) : Boolean(paymentReference.trim()));
  const invalid = cart.some(item => !discountLine(stock.get(item.id)?.selling_price||0,item.quantity,item.discount_percent) || !stock.get(item.id) || !available(stock.get(item.id)) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > stock.get(item.id).stock_quantity);

  function add(medicine) {
    if(locked) return;
    setError(''); setPaymentConfirmed(false);
    setCart(items => {
      const existing = items.find(item => item.id === medicine.id);
      if(existing) return items.map(item => item.id === medicine.id ? {...item,quantity:Math.min(item.quantity+1,medicine.stock_quantity)} : item);
      return [...items,{id:medicine.id,quantity:1,discount_percent:validDiscount(effectiveDiscount) ? Number(effectiveDiscount) : 0}];
    });
  }
  function quantity(id,value) {
    if(locked) return;
    setPaymentConfirmed(false);
    setCart(items => items.map(item => item.id === id ? {...item,quantity:value === '' ? '' : Number(value)} : item));
  }
  async function checkout(event) {
    event.preventDefault();
    if (!pending && dayKey() !== discountDay) { setDiscountDay(dayKey()); setError('A new day has started. Set today’s discount before completing this sale.'); return; }
    if(submitting.current || !paymentConfirmed || (!pending && (!cart.length || invalid || !paymentValid || !discountReady || !patient.trim() || !prescriber.trim()))) return;
    const payload = pending || {request_id:crypto.randomUUID(),patient_name:patient.trim(),prescribed_by:prescriber.trim(),payment:{method:paymentMethod,tendered:tendered.toFixed(2),reference:paymentMethod === 'cash' ? null : paymentReference.trim(),confirmed:paymentConfirmed},items:cart.map(item => ({medicine_id:item.id,quantity:item.quantity,discount_percent:Number(item.discount_percent)}))};
    submitting.current = true; setBusy(true); setPending(payload); setError('');
    try {
      const {data} = await api.post('/sales/checkout',payload,{timeout:90000});
      setReceipt({...data,patient:payload.patient_name,doctor:payload.prescribed_by});
      setCart([]); setCustomerDiscount(''); setDiscountNotice(''); setCashReceived(''); setPaymentReference(''); setPaymentConfirmed(false); setPatient(''); setPrescriber(''); setPending(null); setReload(v=>v+1);
    } catch(err) {
      setError(errorText(err));
      // Keep the exact request after network/server errors; replay is idempotent.
      if(err.response && [400,403,404,422].includes(err.response.status)) setPending(null);
    } finally { submitting.current=false; setBusy(false); }
  }

  return <div className="dispense-page">
    <header className="dispense-heading"><div><p className="dispense-kicker">PHARMACIST WORKSPACE</p><h1>Good care. Clear checkout.</h1><p>Welcome, {profile.first_name}. Prepare your next medicine sale.</p></div><div className="dispense-date"><i className="fa-regular fa-calendar" aria-hidden="true" />{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}<span><span className="dispense-dot" /> Dispensing counter</span></div></header>
    <BillingDetails />
    <div className="dispense-top-summary">
      <div className="dispense-sold-summary"><TodaySales medicines={medicines} refreshKey={reload} /></div>
      <fieldset className="dispense-daily-discount dispense-discount-summary" disabled={locked}>
        <legend className="visually-hidden">Today’s discount</legend>
        <div className="dispense-discount-heading"><span><i className="fa-solid fa-percent" aria-hidden="true" /> Today’s discount</span><small>Saved for today on this browser</small></div>
        <div className="dispense-discount-fields">
          <label htmlFor="daily-discount">Daily default %<input id="daily-discount" type="number" min="0" max="100" step="0.01" value={dailyDraft} placeholder="0–100" onChange={event=>setDailyDraft(event.target.value)} /></label>
          <button type="button" disabled={locked || !validDiscount(dailyDraft)} onClick={setTodaysDiscount} title="Save today’s default and replace discounts on all selected medicines">Set and apply</button>
          <label htmlFor="customer-discount">This customer % <span>Optional</span><input id="customer-discount" type="number" min="0" max="100" step="0.01" value={customerDiscount} placeholder={dailyDiscount === '' ? 'Set default first' : `Default ${dailyDiscount}%`} onChange={event=>changeCustomerDiscount(event.target.value)} disabled={locked || dailyDiscount === ''} /></label>
        </div>
        <p className="dispense-discount-caption">Applies to all medicines. Individual line discounts remain editable.</p>
        {!discountReady && <p className="dispense-discount-required">{dailyDiscount === '' ? 'Set today’s default before checkout. Use 0 for no discount.' : 'Customer discount must be 0–100%, with up to 2 decimals.'}</p>}
        {discountNotice && <p className="dispense-discount-status" role="status">{discountNotice}</p>}
      </fieldset>
    </div>

    <div className="dispense-layout">
      <section className="dispense-catalog"><div className="dispense-section-title"><div><span className="dispense-step">01</span><h2>Select medicines</h2></div><button className="dispense-refresh" disabled={loading || locked} onClick={()=>setReload(v=>v+1)}><i className="fa-solid fa-rotate" aria-hidden="true" /> Refresh stock</button></div>
        <label className="dispense-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><input autoFocus aria-label="Search available medicines" placeholder="Search medicine, generic name, SKU or batch…" value={search} onChange={e=>setSearch(e.target.value)} /></label>
        <div className="dispense-catalog-meta"><span>{loading ? 'Checking available stock…' : `${sellable.length} available medicines`}</span><span>In stock · Unexpired</span></div>
        {loading ? <div className="dispense-empty" role="status"><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /><h3>Getting your counter ready</h3><p>Loading current medicine stock.</p></div> : loadError ? <div className="dispense-empty" role="alert"><h3>Stock unavailable</h3><p>{loadError}</p><button onClick={()=>setReload(v=>v+1)}>Try again</button></div> : matches.length ? <><div className="dispense-medicine-grid">{matches.slice(0,40).map(m => {
          const count = cart.find(item=>item.id===m.id)?.quantity || 0;
          return <article className={`dispense-medicine ${count ? 'selected' : ''}`} key={m.id}><div className="dispense-medicine-top"><span className="dispense-pill-icon"><i className="fa-solid fa-capsules" aria-hidden="true" /></span><span className="dispense-stock">{m.stock_quantity} available</span></div><h3>{m.name}</h3><p>{m.generic_name || m.sku}</p><div className="dispense-batch">Batch {m.batch_number}<span>Exp. {m.expiry_date}</span></div><div className="dispense-medicine-bottom"><strong>{money(m.selling_price)}<small> / unit</small></strong><button aria-label={`Add ${m.name}, batch ${m.batch_number}`} disabled={locked || count>=m.stock_quantity} onClick={()=>add(m)}>{count ? `${count} added` : <><i className="fa-solid fa-plus" aria-hidden="true" /> Add</>}</button></div></article>;
        })}</div>{matches.length>40 && <p className="dispense-hint">Showing 40 of {matches.length} matches. Search to find a specific medicine.</p>}</> : <div className="dispense-empty"><i className="fa-solid fa-box-open" aria-hidden="true" /><h3>{search ? 'No matching medicines' : 'No saleable stock yet'}</h3><p>{search ? 'Try a medicine name, SKU or batch number.' : 'Receive and allocate stock to start selling. Expired medicines are excluded.'}</p></div>}
      </section>
      <form ref={billRef} className="dispense-bill" onSubmit={checkout}>
    {receipt && <section className="dispense-success dispense-receipt" ref={receiptRef} role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /><div><strong>Invoice INV-{String(receipt.id).padStart(6, '0')} generated</strong><p>GSTIN: {receipt.company?.gstin || 'Not recorded'} · GST / tax recorded: {money(receipt.tax_amount)}</p><p>{receipt.patient} · {receipt.items.reduce((n,item)=>n+item.quantity,0)} units · Total {money(receipt.total_amount)}. Stock has been updated.</p>{receipt.payment && <p>Paid by {receipt.payment.method.replace('_',' ')} · Received {money(receipt.payment.tendered)}{Number(receipt.payment.change)>0 ? ` · Change due ${money(receipt.payment.change)}` : ''}{receipt.payment.reference ? ` · Ref: ${receipt.payment.reference}` : ''}</p>}</div><button type="button" className="dispense-print" onClick={()=>printInvoice(receipt,medicines,money)}><i className="fa-solid fa-print" aria-hidden="true" /> Print / Save PDF</button><p className="dispense-print-help">No printer available? Choose “Save as PDF” in the print dialog to save your bill.</p><button type="button" className="dispense-receipt-dismiss" onClick={()=>setReceipt(null)} aria-label="Dismiss sale confirmation">×</button></section>}
        <div className="dispense-section-title"><div><span className="dispense-step">02</span><h2>Patient & bill</h2></div><span className="dispense-draft">New sale</span></div>
        <fieldset disabled={locked}><label className="dispense-field">Patient name <span>*</span><input required minLength={2} maxLength={150} value={patient} onChange={e=>setPatient(e.target.value)} placeholder="Enter patient's full name" autoComplete="off" /></label><label className="dispense-field">Prescribed by <span>*</span><input required minLength={2} maxLength={150} list="dispense-doctors" value={prescriber} onChange={e=>setPrescriber(e.target.value)} placeholder="Select or type doctor's name" autoComplete="off" /><datalist id="dispense-doctors">{doctors.map(name=><option key={name} value={name} />)}</datalist></label></fieldset>
        <p className="dispense-hint">{doctorError ? 'Doctor suggestions are unavailable. Enter the prescriber’s name manually.' : 'Choose a known prescriber or enter an external doctor’s name.'}</p>
        <div className="dispense-cart-heading"><h3>Selected medicines</h3><span>{cart.length} items</span></div>
        {!cart.length ? <div className="dispense-cart-empty"><i className="fa-solid fa-basket-shopping" aria-hidden="true" /><p>Your bill starts here</p><small>Add medicines from the list.</small></div> : <div className="dispense-cart">{cart.map(item=>{const m=stock.get(item.id);return <div className="dispense-cart-item" key={item.id}><div className="dispense-cart-name"><strong>{m?.name || 'Unavailable medicine'}</strong><button type="button" aria-label={`Remove ${m?.name || 'medicine'}`} disabled={locked} onClick={()=>{setCart(items=>items.filter(i=>i.id!==item.id));setPaymentConfirmed(false);}}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div><small>Batch {m?.batch_number} · {money(m?.selling_price || 0)} / unit</small><div className="dispense-cart-line"><div className="dispense-quantity"><button type="button" aria-label={`Decrease ${m?.name} quantity`} disabled={locked || item.quantity<=1} onClick={()=>quantity(item.id,item.quantity-1)}>−</button><input aria-label={`Quantity for ${m?.name}`} type="number" min="1" max={m?.stock_quantity || 1} step="1" required disabled={locked} value={item.quantity} onChange={e=>quantity(item.id,e.target.value)} /><button type="button" aria-label={`Increase ${m?.name} quantity`} disabled={locked || item.quantity>=m?.stock_quantity} onClick={()=>quantity(item.id,Number(item.quantity)+1)}>+</button></div><strong>{money(discountLine(m?.selling_price||0,item.quantity,item.discount_percent)?.total||0)}</strong></div><label className="dispense-line-discount">Discount %<input type="number" min="0" max="100" step="0.01" required disabled={locked} aria-label={`Discount percentage for ${m?.name}`} value={item.discount_percent} onChange={event=>{setCart(items=>items.map(row=>row.id===item.id?{...row,discount_percent:event.target.value}:row));setPaymentConfirmed(false);}}/><span>Save {money(discountLine(m?.selling_price||0,item.quantity,item.discount_percent)?.discount||0)}</span></label></div>;})}</div>}
        <div className="dispense-totals"><div><span>Total units</span><strong>{units || 0}</strong></div><div><span>Before discount</span><strong>{money(grossTotal)}</strong></div><div><span>Discount</span><strong>−{money(totalDiscount)}</strong></div><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>GST / tax</span><strong>{money(0)}</strong></div><div className="dispense-grand-total"><span>Bill total</span><strong>{money(total)}</strong></div></div>
        <fieldset className="dispense-payment" disabled={locked}>
          <legend><span className="dispense-step">03</span> Payment</legend>
          <div className="dispense-payment-methods" role="group" aria-label="Payment method">{[['cash','Cash','fa-money-bill-wave'],['upi','UPI','fa-mobile-screen'],['card','Card','fa-credit-card'],['bank_transfer','Bank transfer','fa-building-columns']].map(([value,label,icon]) => <button type="button" key={value} aria-pressed={paymentMethod===value} className={paymentMethod===value ? 'chosen' : ''} onClick={()=>{setPaymentMethod(value);setPaymentConfirmed(false);setPaymentReference('');}}><i className={`fa-solid ${icon}`} aria-hidden="true" />{label}</button>)}</div>
          {paymentMethod==='cash' ? <><label className="dispense-field">Cash received<input type="number" min={total} step="0.01" required value={cashReceived} placeholder="0.00" onChange={e=>{setCashReceived(e.target.value);setPaymentConfirmed(false);}} /></label><button className="dispense-exact" type="button" disabled={!cart.length} onClick={()=>{setCashReceived(total.toFixed(2));setPaymentConfirmed(false);}}>Exact amount · {money(total)}</button><div className={`dispense-change ${cashReceived && tendered<total ? 'short' : ''}`}><span>{cashReceived && tendered<total ? 'Still to collect' : 'Change to return'}</span><strong>{money(Math.abs((cashReceived ? tendered : total)-total))}</strong></div></> : <><label className="dispense-field">{paymentMethod==='upi' ? 'UPI transaction / UTR reference' : paymentMethod==='card' ? 'Terminal transaction reference' : 'Bank transfer reference'}<input required maxLength={100} value={paymentReference} placeholder="Enter receipt reference" onChange={e=>{setPaymentReference(e.target.value);setPaymentConfirmed(false);}} /></label><p className="dispense-hint">Collect {money(total)} using your {paymentMethod==='card' ? 'card terminal' : paymentMethod==='upi' ? 'UPI app or QR code' : 'bank account'}. Enter the transaction reference, not card details or a PIN.</p></>}
          <label className="dispense-paid-confirmation"><input type="checkbox" checked={paymentConfirmed} required onChange={e=>setPaymentConfirmed(e.target.checked)} /><span>I confirm the payment has been received.</span></label>
        </fieldset>
        {invalid && <p className="dispense-error" role="alert">Check quantities and discounts: quantities must be whole numbers within stock, and discounts must be 0–100% with up to two decimal places.</p>}
        {error && <p className="dispense-error" role="alert">{error}</p>}
        {pending && !busy && <p className="dispense-hint">Keep this page open and retry this bill to confirm its status without creating a duplicate.</p>}
        <button className="dispense-checkout" type="submit" disabled={busy || !paymentConfirmed || (!pending && (loading || Boolean(loadError) || !cart.length || invalid || !paymentValid || !discountReady))}>{busy ? 'Confirming sale…' : pending ? 'Retry / confirm this sale' : `Complete paid sale · ${money(total)}`} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button>
        <p className="dispense-footer-note"><i className="fa-solid fa-shield-halved" aria-hidden="true" /> Stock and final prices are checked when you complete the sale.</p>
      </form>
    </div>
    {cart.length > 0 && <button type="button" className="dispense-mobile-bill" onClick={() => billRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}><span>{units} units · {money(total)}</span><strong>Review bill <i className="fa-solid fa-arrow-down" aria-hidden="true" /></strong></button>}
  </div>;
}
