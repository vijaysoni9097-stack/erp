import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import '../styles/Dispense.css';

const money = value => Number(value).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const available = medicine => medicine.stock_quantity > 0 && medicine.expiry_date >= today();
function errorText(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(e => e.msg).join(' ') : 'The service did not confirm this sale. Retry the same bill to check it safely.';
}

export default function Dispense({profile}) {
  const [medicines, setMedicines] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [doctorError, setDoctorError] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [patient, setPatient] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [pending, setPending] = useState(null);
  const submitting = useRef(false);
  const billRef = useRef(null);
  const locked = busy || Boolean(pending);

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
  const total = cart.reduce((n,item) => n+Math.round(Number(stock.get(item.id)?.selling_price || 0)*100)*item.quantity,0)/100;
  const invalid = cart.some(item => !stock.get(item.id) || !available(stock.get(item.id)) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > stock.get(item.id).stock_quantity);

  function add(medicine) {
    if(locked) return;
    setReceipt(null); setError('');
    setCart(items => {
      const existing = items.find(item => item.id === medicine.id);
      if(existing) return items.map(item => item.id === medicine.id ? {...item,quantity:Math.min(item.quantity+1,medicine.stock_quantity)} : item);
      return [...items,{id:medicine.id,quantity:1}];
    });
  }
  function quantity(id,value) {
    if(locked) return;
    setCart(items => items.map(item => item.id === id ? {...item,quantity:value === '' ? '' : Number(value)} : item));
  }
  async function checkout(event) {
    event.preventDefault();
    if(submitting.current || (!pending && (!cart.length || invalid || !patient.trim() || !prescriber.trim()))) return;
    const payload = pending || {request_id:crypto.randomUUID(),patient_name:patient.trim(),prescribed_by:prescriber.trim(),items:cart.map(item => ({medicine_id:item.id,quantity:item.quantity}))};
    submitting.current = true; setBusy(true); setPending(payload); setError('');
    try {
      const {data} = await api.post('/sales/checkout',payload,{timeout:90000});
      setReceipt({...data,patient:payload.patient_name,doctor:payload.prescribed_by});
      setCart([]); setPatient(''); setPrescriber(''); setPending(null); setReload(v=>v+1);
    } catch(err) {
      setError(errorText(err));
      // Keep the exact request after network/server errors; replay is idempotent.
      if(err.response && [400,403,404,422].includes(err.response.status)) setPending(null);
    } finally { submitting.current=false; setBusy(false); }
  }

  return <div className="dispense-page">
    <header className="dispense-heading"><div><p className="dispense-kicker">PHARMACIST WORKSPACE</p><h1>Good care. Clear checkout.</h1><p>Welcome, {profile.first_name}. Prepare your next medicine sale.</p></div><div className="dispense-date"><i className="fa-regular fa-calendar" aria-hidden="true" />{new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}<span><span className="dispense-dot" /> Dispensing counter</span></div></header>
    {receipt && <section className="dispense-success" role="status"><i className="fa-solid fa-circle-check" aria-hidden="true" /><div><strong>Sale #{receipt.id} completed</strong><p>{receipt.patient} · {receipt.items.reduce((n,item)=>n+item.quantity,0)} units · Total {money(receipt.total_amount)}. Stock has been updated.</p></div><button onClick={()=>setReceipt(null)} aria-label="Dismiss sale confirmation">×</button></section>}
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
        <div className="dispense-section-title"><div><span className="dispense-step">02</span><h2>Patient & bill</h2></div><span className="dispense-draft">New sale</span></div>
        <fieldset disabled={locked}><label className="dispense-field">Patient name <span>*</span><input required minLength={2} maxLength={150} value={patient} onChange={e=>setPatient(e.target.value)} placeholder="Enter patient's full name" autoComplete="off" /></label><label className="dispense-field">Prescribed by <span>*</span><input required minLength={2} maxLength={150} list="dispense-doctors" value={prescriber} onChange={e=>setPrescriber(e.target.value)} placeholder="Select or type doctor's name" autoComplete="off" /><datalist id="dispense-doctors">{doctors.map(name=><option key={name} value={name} />)}</datalist></label></fieldset>
        <p className="dispense-hint">{doctorError ? 'Doctor suggestions are unavailable. Enter the prescriber’s name manually.' : 'Choose a known prescriber or enter an external doctor’s name.'}</p>
        <div className="dispense-cart-heading"><h3>Selected medicines</h3><span>{cart.length} items</span></div>
        {!cart.length ? <div className="dispense-cart-empty"><i className="fa-solid fa-basket-shopping" aria-hidden="true" /><p>Your bill starts here</p><small>Add medicines from the list.</small></div> : <div className="dispense-cart">{cart.map(item=>{const m=stock.get(item.id);return <div className="dispense-cart-item" key={item.id}><div className="dispense-cart-name"><strong>{m?.name || 'Unavailable medicine'}</strong><button type="button" aria-label={`Remove ${m?.name || 'medicine'}`} disabled={locked} onClick={()=>setCart(items=>items.filter(i=>i.id!==item.id))}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div><small>Batch {m?.batch_number} · {money(m?.selling_price || 0)} / unit</small><div className="dispense-cart-line"><div className="dispense-quantity"><button type="button" aria-label={`Decrease ${m?.name} quantity`} disabled={locked || item.quantity<=1} onClick={()=>quantity(item.id,item.quantity-1)}>−</button><input aria-label={`Quantity for ${m?.name}`} type="number" min="1" max={m?.stock_quantity || 1} step="1" required disabled={locked} value={item.quantity} onChange={e=>quantity(item.id,e.target.value)} /><button type="button" aria-label={`Increase ${m?.name} quantity`} disabled={locked || item.quantity>=m?.stock_quantity} onClick={()=>quantity(item.id,Number(item.quantity)+1)}>+</button></div><strong>{money((m?.selling_price || 0)*item.quantity)}</strong></div></div>;})}</div>}
        <div className="dispense-totals"><div><span>Total units</span><strong>{units || 0}</strong></div><div><span>Subtotal</span><strong>{money(total)}</strong></div><div className="dispense-grand-total"><span>Bill total</span><strong>{money(total)}</strong></div></div>
        {invalid && <p className="dispense-error" role="alert">Check quantities: each must be a whole number within available stock.</p>}
        {error && <p className="dispense-error" role="alert">{error}</p>}
        {pending && !busy && <p className="dispense-hint">Keep this page open and retry this bill to confirm its status without creating a duplicate.</p>}
        <button className="dispense-checkout" type="submit" disabled={busy || (!pending && (loading || Boolean(loadError) || !cart.length || invalid))}>{busy ? 'Confirming sale…' : pending ? 'Retry / confirm this sale' : 'Complete sale'}<i className="fa-solid fa-arrow-right" aria-hidden="true" /></button>
        <p className="dispense-footer-note"><i className="fa-solid fa-shield-halved" aria-hidden="true" /> Stock and final prices are checked when you complete the sale.</p>
      </form>
    </div>
    {cart.length > 0 && <button type="button" className="dispense-mobile-bill" onClick={() => billRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}><span>{units} units · {money(total)}</span><strong>Review bill <i className="fa-solid fa-arrow-down" aria-hidden="true" /></strong></button>}
  </div>;
}
