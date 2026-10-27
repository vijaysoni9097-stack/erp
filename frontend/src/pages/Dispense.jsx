import { checkoutPayment } from '../services/creditPayment';
import { sellableMedicines, validateDispenseLine } from '../services/dispenseValidation';
import { useCurrency } from '../contexts/CurrencyContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import TodaySales from '../components/TodaySales';
import CreditAccounts, { whatsappLabel } from '../components/CreditAccounts';
import BillingDetails from '../components/BillingDetails';
import '../styles/StockManagement.css';
import { normalizeCustomerMobile } from '../services/customerMobile';
import { dayKey } from '../services/dailySales';
import { validDiscount, readDailyDiscount, saveDailyDiscount, applyBillDiscount } from '../services/dailyDiscount';
import { discountLine } from '../services/discounts';
import { printInvoice } from '../services/printInvoice';
import '../styles/Dispense.css';

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
  const [dailyDiscount, setDailyDiscount] = useState('0');
  const [dailyDraft, setDailyDraft] = useState('0');
  const [customerDiscount, setCustomerDiscount] = useState('');
  const [discountNotice, setDiscountNotice] = useState('');
  const [patient, setPatient] = useState('');
  const [mobile, setMobile] = useState('');
  const [customerMatches, setCustomerMatches] = useState([]);
  const [lookupMessage, setLookupMessage] = useState('');
  const nameEdited = useRef(false);
  const autoName = useRef('');
  const [prescriber, setPrescriber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saleMode, setSaleMode] = useState('paid');
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const creditDialog = useRef(null);
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
  useEffect(()=>{
    if(!receipt || !['queued','sending'].includes(receipt.whatsapp_status))return;
    const controller=new AbortController();
    const timer=setInterval(()=>api.get(`/credits/${receipt.id}`,{signal:controller.signal}).then(({data})=>{
      if(!controller.signal.aborted)setReceipt(old=>old?.id===data.invoice.id?{...old,...data.invoice}:old);
    }).catch(()=>{}),5000);
    return()=>{clearInterval(timer);controller.abort();};
  },[receipt?.id,receipt?.whatsapp_status]);
  const locked = busy || Boolean(pending);

  const normalizedMobile = normalizeCustomerMobile(mobile);
  useEffect(() => {
    setCustomerMatches([]);setLookupMessage('');
    if (locked || !mobile.trim() || !normalizedMobile) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookupMessage('Checking saved customer…');
      try {
        const {data} = await api.get('/customers/lookup',{params:{phone:normalizedMobile},signal:controller.signal});
        if(controller.signal.aborted)return;
        setCustomerMatches(data);
        if(data.length===1) {
          if(!nameEdited.current){setPatient(data[0].full_name);autoName.current=data[0].full_name;setPaymentConfirmed(false);}
          setLookupMessage('Saved customer found. Confirm the name before checkout.');
        } else setLookupMessage(data.length ? 'This mobile is shared. Choose the customer below.' : 'New mobile number. Enter the customer name to save it with this sale.');
      } catch {if(!controller.signal.aborted)setLookupMessage('Customer lookup unavailable. Enter the name manually; checkout will still check saved customers.');}
    },400);
    return () => {clearTimeout(timer);controller.abort();};
  },[mobile,normalizedMobile,locked]);

  useEffect(() => {
    const checkDay = () => setDiscountDay(dayKey());
    const timer = setInterval(checkDay, 30000);
    window.addEventListener('focus', checkDay);
    return () => { clearInterval(timer); window.removeEventListener('focus', checkDay); };
  }, []);
  useEffect(() => {
    let value = '0';
    try { value = readDailyDiscount(window.localStorage, profile.id, discountDay); } catch { /* Storage may be disabled. */ }
    setDailyDiscount(value);setDailyDraft(value);setCustomerDiscount('');setDiscountNotice('');
  }, [profile.id, discountDay]);

  function setTodaysDiscount(override) {
    const draft = typeof override === 'string' ? override : dailyDraft;
    if (locked || !validDiscount(draft)) return;
    const value = String(Number(draft));
    let stored = false;
    try { stored = saveDailyDiscount(window.localStorage, profile.id, dayKey(), value); } catch { /* Keep working in this session. */ }
    setDiscountDay(dayKey());setDailyDiscount(value);setDailyDraft(value);setCustomerDiscount('');
    setCart(items => applyBillDiscount(items, value));setPaymentConfirmed(false);
    setDiscountNotice(stored ? `Default ${value}% saved and applied.` : 'Discount applied. Browser storage is unavailable; re-enter it after reloading.');
  }
  function changeCustomerDiscount(value) {
    if (locked) return;
    setCustomerDiscount(value);setPaymentConfirmed(false);
    const effective = value === '' ? (dailyDiscount || '0') : value;
    if (validDiscount(effective)) setCart(items => applyBillDiscount(items, effective));
    setDiscountNotice('Customer override applies to this bill only.');
  }
  const effectiveDiscount = customerDiscount === '' ? (dailyDiscount || '0') : customerDiscount;
  const discountReady = validDiscount(effectiveDiscount);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setDoctorError(false);
    api.get('/medicines', {signal:controller.signal,timeout:90000})
      .then(({data}) => { if (!controller.signal.aborted) setMedicines(data); })
      .catch(() => { if (!controller.signal.aborted) setLoadError('Medicine stock could not be loaded. Please refresh to try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    api.get('/sales/prescribers', {signal:controller.signal,timeout:90000})
      .then(({data}) => { if (!controller.signal.aborted) setDoctors(data); })
      .catch(() => { if (!controller.signal.aborted) setDoctorError(true); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!cart.length && !pending) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [cart.length, pending]);

  const stock = useMemo(() => new Map(medicines.map(m => [m.id,m])), [medicines]);
  const sellable = useMemo(() => sellableMedicines(medicines), [medicines]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sellable.filter(m => [m.name,m.generic_name,m.sku,m.batch_number].some(v => v?.toLowerCase().includes(term)));
  }, [sellable,search]);
  const units = cart.reduce((n,item) => n+Number(item.quantity || 0),0);
  const grossTotal = cart.reduce((sum,item)=>sum+Math.round(Number(stock.get(item.id)?.selling_price||0)*100)*item.quantity,0)/100;
  const total = cart.reduce((sum,item)=>sum+Math.round((discountLine(stock.get(item.id)?.selling_price||0,item.quantity,item.discount_percent)?.total||0)*100),0)/100;
  const totalDiscount = Math.round((grossTotal-total)*100)/100;
  const {tendered,outstanding,valid:paymentValid} = checkoutPayment({mode:saleMode,method:paymentMethod,received:cashReceived,total,confirmed:paymentConfirmed,reference:paymentReference,phone:normalizedMobile});
  const lineErrors = cart.map(item => ({id:item.id, name:stock.get(item.id)?.name || 'Medicine', message:validateDispenseLine(item, stock.get(item.id))})).filter(row => row.message);
  const invalid = lineErrors.length > 0;

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
  async function checkout(event, creditAcknowledged = false) {
    event?.preventDefault();
    if (!pending && dayKey() !== discountDay) { setDiscountDay(dayKey()); setError('A new day has started. Today’s default is 0% unless saved. Review this bill’s discounts and submit again.'); return; }
    if(submitting.current || (!pending && (!cart.length || invalid || !paymentValid || !discountReady || normalizedMobile === null || !patient.trim()))) return;
    if (!pending && outstanding>0 && !creditAcknowledged) { creditDialog.current.showModal(); return; }
    const payload = pending || {request_id:crypto.randomUUID(),patient_name:patient.trim(),prescribed_by:prescriber.trim() || 'self',customer_mobile:normalizedMobile || null,credit_acknowledged:creditAcknowledged,whatsapp_consent:whatsappConsent,payment:{method:saleMode==='credit'?'cash':paymentMethod,tendered:tendered.toFixed(2),reference:saleMode==='credit'||paymentMethod === 'cash' ? null : paymentReference.trim(),confirmed:paymentConfirmed},items:cart.map(item => ({medicine_id:item.id,quantity:item.quantity,discount_percent:Number(item.discount_percent)}))};
    submitting.current = true; setBusy(true); setPending(payload); setError('');
    try {
      const {data} = await api.post('/sales/checkout',payload,{timeout:90000});
      setReceipt({...data,patient:payload.patient_name,doctor:payload.prescribed_by,mobile:payload.customer_mobile});
      setSaleMode('paid');setWhatsappConsent(false);setCart([]); setCustomerDiscount(''); setDiscountNotice(''); setCashReceived(''); setPaymentReference(''); setPaymentConfirmed(false); setPatient(''); setPrescriber(''); setMobile('');setCustomerMatches([]);setLookupMessage('');nameEdited.current=false;autoName.current=''; setPending(null); setReload(v=>v+1);
    } catch(err) {
      setError(errorText(err));
      // Keep the exact request after network/server errors; replay is idempotent.
      if(err.response && [400,403,404,422].includes(err.response.status)) setPending(null);
    } finally { submitting.current=false; setBusy(false); }
  }

  return <div className="dispense-page">
    <header className="dispense-heading"><div><h1>Good care. Clear checkout.</h1><p>Welcome, {profile.first_name}. Prepare your next medicine sale.</p></div><div className="dispense-date"><i className="fa-regular fa-calendar" aria-hidden="true" />{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}<span><span className="dispense-dot" /> Dispensing counter</span></div></header>
    <BillingDetails />
    <div className="dispense-top-summary">
      <CreditAccounts refreshKey={reload} />
      <div className="dispense-sold-summary"><TodaySales medicines={medicines} refreshKey={reload} /></div>
      <fieldset className="dispense-daily-discount dispense-discount-summary" disabled={locked}>
        <legend className="visually-hidden">Today’s discount</legend>
        <div className="dispense-discount-heading"><span><i className="fa-solid fa-percent" aria-hidden="true" /> Today’s discount</span><small>Saved for today on this browser</small></div>
        <div className="dispense-discount-fields">
          <label htmlFor="daily-discount">Daily default %<input id="daily-discount" type="number" min="0" max="100" step="0.01" value={dailyDraft} placeholder="0–100" onChange={event=>setDailyDraft(event.target.value)} /></label>
          <button type="button" disabled={locked || !validDiscount(dailyDraft)} onClick={setTodaysDiscount} title="Save today’s default and replace discounts on all selected medicines">Set and apply</button>
          <label htmlFor="customer-discount">This customer % <span>Optional</span><input id="customer-discount" type="number" min="0" max="100" step="0.01" value={customerDiscount} placeholder={`Default ${dailyDiscount || '0'}%`} onChange={event=>changeCustomerDiscount(event.target.value)} disabled={locked} /></label>
        </div>
        <p className="dispense-discount-caption">Defaults to 0% if not set. Individual line discounts remain editable.</p>
        {!discountReady && <p className="dispense-discount-required">Customer discount must be 0–100%, with up to 2 decimals.</p>}
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
    {receipt && <section className="dispense-success dispense-receipt" ref={receiptRef} role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /><div><strong>Invoice INV-{String(receipt.id).padStart(6, '0')} generated</strong><p>GSTIN: {receipt.company?.gstin || 'Not recorded'} · GST / tax recorded: {money(receipt.tax_amount)}</p><p>{receipt.patient} · {receipt.items.reduce((n,item)=>n+item.quantity,0)} units · Total {money(receipt.total_amount)}. Stock has been updated.</p>{Number(receipt.outstanding_amount)>0 && <p><strong>Credit outstanding: {money(receipt.outstanding_amount)}</strong></p>}{receipt.whatsapp_status && <p>{whatsappLabel(receipt.whatsapp_status)}</p>}{receipt.payment && <p>Payment method: {receipt.payment.method.replace('_',' ')} · Received {money(receipt.payment.tendered)}{Number(receipt.payment.change)>0 ? ` · Change due ${money(receipt.payment.change)}` : ''}{receipt.payment.reference ? ` · Ref: ${receipt.payment.reference}` : ''}</p>}</div><button type="button" className="dispense-print" onClick={()=>printInvoice(receipt,medicines,money)}><i className="fa-solid fa-print" aria-hidden="true" /> Print / Save PDF</button><p className="dispense-print-help">No printer available? Choose “Save as PDF” in the print dialog to save your bill.</p><button type="button" className="dispense-receipt-dismiss" onClick={()=>setReceipt(null)} aria-label="Dismiss sale confirmation">×</button></section>}
        <div className="dispense-section-title"><div><span className="dispense-step">02</span><h2>Patient & bill</h2></div><span className="dispense-draft">New sale</span></div>
        <fieldset disabled={locked}>
          <label className="dispense-field">Customer mobile <small>{saleMode==='paid'?'Optional':'Required for credit'}</small><input type="tel" required={saleMode!=='paid'} maxLength={40} autoComplete="off" value={mobile} placeholder="10-digit Indian mobile or +country code" aria-describedby="customer-mobile-hint" onChange={event=>{if(autoName.current){setPatient('');autoName.current='';nameEdited.current=false;}else nameEdited.current=Boolean(patient.trim());setMobile(event.target.value);setPaymentConfirmed(false);}} /></label>
          <p id="customer-mobile-hint" className="dispense-hint" role="status">{normalizedMobile===null?'Enter a valid mobile number with an optional country code.':lookupMessage || 'Enter a saved mobile number to find the customer name.'}</p>
          {customerMatches.length>0 && <div className="dispense-customer-matches">{customerMatches.map(customer=><button type="button" key={customer.id} onClick={()=>{setPatient(customer.full_name);autoName.current=customer.full_name;nameEdited.current=false;setPaymentConfirmed(false);}}>{customer.full_name}</button>)}</div>}
          <label className="dispense-field">Patient name <span>*</span><input required minLength={2} maxLength={150} value={patient} onChange={e=>{nameEdited.current=true;autoName.current='';setPatient(e.target.value);setPaymentConfirmed(false);}} placeholder="Enter patient's full name" autoComplete="off" /></label>
          <label className="dispense-field">Prescribed by <small>Optional</small><input minLength={2} maxLength={150} list="dispense-doctors" value={prescriber} onChange={e=>{setPrescriber(e.target.value);setPaymentConfirmed(false);}} placeholder="Self (default) or doctor’s name" autoComplete="off" /><datalist id="dispense-doctors">{doctors.map(name=><option key={name} value={name} />)}</datalist></label>
        </fieldset>
        {normalizedMobile && <CreditAccounts key={normalizedMobile} phone={normalizedMobile} refreshKey={reload} currentUnpaid={outstanding} />}
        <p className="dispense-hint">{doctorError ? 'Doctor suggestions are unavailable. Leave blank for Self or enter the prescriber’s name.' : 'Leave blank for Self, or select or enter the prescriber’s name.'}</p>
        <div className="dispense-cart-heading"><h3>Selected medicines</h3><span>{cart.length} items</span></div>
        {!cart.length ? <div className="dispense-cart-empty"><i className="fa-solid fa-basket-shopping" aria-hidden="true" /><p>Your bill starts here</p><small>Add medicines from the list.</small></div> : <div className="dispense-cart">{cart.map(item=>{const m=stock.get(item.id);return <div className="dispense-cart-item" key={item.id}><div className="dispense-cart-name"><strong>{m?.name || 'Unavailable medicine'}</strong><button type="button" aria-label={`Remove ${m?.name || 'medicine'}`} disabled={locked} onClick={()=>{setCart(items=>items.filter(i=>i.id!==item.id));setPaymentConfirmed(false);}}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div><small>Batch {m?.batch_number} · {money(m?.selling_price || 0)} / unit</small><div className="dispense-cart-line"><div className="dispense-quantity"><button type="button" aria-label={`Decrease ${m?.name} quantity`} disabled={locked || item.quantity<=1} onClick={()=>quantity(item.id,item.quantity-1)}>−</button><input aria-label={`Quantity for ${m?.name}`} type="number" min="1" max={m?.stock_quantity || 1} step="1" required disabled={locked} value={item.quantity} onChange={e=>quantity(item.id,e.target.value)} /><button type="button" aria-label={`Increase ${m?.name} quantity`} disabled={locked || item.quantity>=m?.stock_quantity} onClick={()=>quantity(item.id,Number(item.quantity)+1)}>+</button></div><strong>{money(discountLine(m?.selling_price||0,item.quantity,item.discount_percent)?.total||0)}</strong></div><label className="dispense-line-discount">Discount %<input type="number" min="0" max="100" step="0.01" required disabled={locked} aria-label={`Discount percentage for ${m?.name}`} value={item.discount_percent} onChange={event=>{setCart(items=>items.map(row=>row.id===item.id?{...row,discount_percent:event.target.value}:row));setPaymentConfirmed(false);}}/><span>Save {money(discountLine(m?.selling_price||0,item.quantity,item.discount_percent)?.discount||0)}</span></label></div>;})}</div>}
        <div className="dispense-totals"><div><span>Total units</span><strong>{units || 0}</strong></div><div><span>Before discount</span><strong>{money(grossTotal)}</strong></div><div><span>Discount</span><strong>−{money(totalDiscount)}</strong></div><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>GST / tax</span><strong>{money(0)}</strong></div><div className="dispense-grand-total"><span>Bill total</span><strong>{money(total)}</strong></div></div>
        <fieldset className="dispense-payment" disabled={locked}>
          <legend><span className="dispense-step">03</span> Payment</legend>
          <label className="dispense-field">Payment status<select value={saleMode} onChange={event=>{setSaleMode(event.target.value);setCashReceived('');setPaymentConfirmed(false);}}><option value="paid">Pay in full</option><option value="partial">Partially paid</option><option value="credit">Full credit · pay later</option></select></label>
          {saleMode!=='credit'&&<>
          <div className="dispense-payment-methods" role="group" aria-label="Payment method">{[['cash','Cash','fa-money-bill-wave'],['upi','UPI','fa-mobile-screen'],['card','Card','fa-credit-card'],['bank_transfer','Bank transfer','fa-building-columns']].map(([value,label,icon]) => <button type="button" key={value} aria-pressed={paymentMethod===value} className={paymentMethod===value ? 'chosen' : ''} onClick={()=>{setPaymentMethod(value);setPaymentConfirmed(false);setPaymentReference('');}}><i className={`fa-solid ${icon}`} aria-hidden="true" />{label}</button>)}</div>
          {paymentMethod==='cash' || saleMode==='partial' ? <><label className="dispense-field">Amount received<input type="number" min={saleMode==='partial'?'0.01':total} max={saleMode==='partial'?Math.max(0,total-0.01):undefined} step="0.01" required value={cashReceived} placeholder="0.00" onChange={e=>{setCashReceived(e.target.value);setPaymentConfirmed(false);}} /></label><button className="dispense-exact" type="button" disabled={!cart.length} onClick={()=>{setCashReceived(total.toFixed(2));setPaymentConfirmed(false);}}>Exact amount · {money(total)}</button><div className={`dispense-change ${cashReceived && tendered<total ? 'short' : ''}`}><span>{cashReceived && tendered<total ? 'Still to collect' : 'Change to return'}</span><strong>{money(Math.abs((cashReceived ? tendered : total)-total))}</strong></div></> : <><label className="dispense-field">{paymentMethod==='upi' ? 'UPI transaction / UTR reference' : paymentMethod==='card' ? 'Terminal transaction reference' : 'Bank transfer reference'}<input required maxLength={100} value={paymentReference} placeholder="Enter receipt reference" onChange={e=>{setPaymentReference(e.target.value);setPaymentConfirmed(false);}} /></label><p className="dispense-hint">Collect {money(total)} using your {paymentMethod==='card' ? 'card terminal' : paymentMethod==='upi' ? 'UPI app or QR code' : 'bank account'}. Enter the transaction reference, not card details or a PIN.</p></>}
          {saleMode==='partial' && paymentMethod!=='cash' && <label className="dispense-field">Transaction reference<input required maxLength={100} value={paymentReference} onChange={e=>{setPaymentReference(e.target.value);setPaymentConfirmed(false);}} /></label>}
          <label className="dispense-paid-confirmation"><input type="checkbox" checked={paymentConfirmed} required onChange={e=>setPaymentConfirmed(e.target.checked)} /><span>I confirm the payment has been received.</span></label>
          </>}
          {saleMode!=='paid'&&<><p className="dispense-hint">Unpaid on this bill: <strong>{money(outstanding)}</strong>. A valid customer mobile is mandatory.</p><label className="dispense-paid-confirmation"><input type="checkbox" checked={whatsappConsent} onChange={e=>setWhatsappConsent(e.target.checked)} /><span>Customer agrees to receive this credit notification on WhatsApp.</span></label></>}
        </fieldset>
        {invalid && <div className="dispense-error" role="alert">{lineErrors.map(row => <p key={row.id}><strong>{row.name}:</strong> {row.message}</p>)}</div>}
        {error && <p className="dispense-error" role="alert">{error}</p>}
        {pending && !busy && <p className="dispense-hint">Keep this page open and retry this bill to confirm its status without creating a duplicate.</p>}
        {!pending && cart.length>0 && !discountReady && <div className="dispense-checkout-help" id="checkout-discount-help" role="status">
          <p>Enter a valid customer discount from 0–100% with up to two decimal places, or leave the customer override blank to use today’s default.</p>
        </div>}
        {!pending && saleMode!=='paid' && !normalizedMobile && <p className="dispense-error" role="status">Enter a valid customer mobile to enable credit checkout.</p>}
        <button aria-describedby={!discountReady && cart.length>0 ? 'checkout-discount-help' : undefined} className="dispense-checkout" type="submit" disabled={busy || (!pending && (loading || Boolean(loadError) || !cart.length || invalid || !paymentValid || !discountReady || normalizedMobile === null))}>{busy ? 'Confirming sale…' : pending ? 'Retry / confirm this sale' : saleMode==='paid'?`Complete paid sale · ${money(total)}`:`Complete credit sale · ${money(outstanding)} unpaid`} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button>
        <p className="dispense-footer-note"><i className="fa-solid fa-shield-halved" aria-hidden="true" /> Stock and final prices are checked when you complete the sale.</p>
      </form>
    </div>
    <dialog ref={creditDialog} className="credit-acknowledgment" aria-labelledby="credit-confirm-title">
      <h2 id="credit-confirm-title">Confirm customer credit</h2>
      <p><strong>{patient}</strong> · {normalizedMobile}</p>
      <p>Bill total: {money(total)} · Collected now: {money(Math.min(total,tendered))}</p>
      <p><strong>{money(outstanding)} will be added to this customer’s unpaid balance.</strong> Stock will be deducted when this invoice is saved.</p>
      <p>{whatsappConsent?'A WhatsApp notification will be queued if the service is configured.':'WhatsApp notification will not be sent without customer consent.'}</p>
      <button type="button" onClick={()=>creditDialog.current.close()}>Back to bill</button>
      <button type="button" onClick={()=>{creditDialog.current.close();checkout(null,true);}}>Acknowledge & submit credit</button>
    </dialog>
    {cart.length > 0 && <button type="button" className="dispense-mobile-bill" onClick={() => billRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}><span>{units} units · {money(total)}</span><strong>Review bill <i className="fa-solid fa-arrow-down" aria-hidden="true" /></strong></button>}
  </div>;
}
