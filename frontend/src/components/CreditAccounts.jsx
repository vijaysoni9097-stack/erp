import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { useCurrency } from '../contexts/CurrencyContext';
import { printInvoice } from '../services/printInvoice';
import { saleDate } from '../services/dailySales';
import '../styles/CreditAccounts.css';

export const whatsappLabel = status => ({queued:'WhatsApp notification queued',not_configured:'WhatsApp not configured — notification not sent',no_consent:'WhatsApp not sent — customer consent not recorded',sending:'Sending WhatsApp notification',accepted:'WhatsApp accepted by provider (delivery not confirmed)',failed:'WhatsApp failed — check provider configuration',unknown:'WhatsApp status uncertain — verify with provider'}[status] || '');
const number = id => `INV-${String(id).padStart(6,'0')}`;
const message = error => typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Could not confirm payment. Retry the same payment to check safely.';

export default function CreditAccounts({ refreshKey, phone = null, currentUnpaid = 0 }) {
  const {formatMoney:money} = useCurrency();
  const [summary,setSummary]=useState(null), [rows,setRows]=useState([]), [count,setCount]=useState(0);
  const [balanceError,setBalanceError]=useState('');
  const [error,setError]=useState(''), [detail,setDetail]=useState(null), [loading,setLoading]=useState(false);
  const [amount,setAmount]=useState(''), [method,setMethod]=useState('cash'), [reference,setReference]=useState('');
  const [confirmed,setConfirmed]=useState(false), [busy,setBusy]=useState(false), [pending,setPending]=useState(null), [revision,setRevision]=useState(0), [notice,setNotice]=useState('');
  const dialog=useRef(null), submitting=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    setSummary(null);
    const load=()=>api.get(phone ? '/credits' : '/credits/summary',{timeout:90000,signal:controller.signal,params:phone?{phone,limit:1}:undefined})
      .then(({data})=>{if(!controller.signal.aborted){setSummary(data);setBalanceError('');}})
      .catch(()=>{if(!controller.signal.aborted)setBalanceError('Credit balance unavailable. Retry.');});
    load(); const timer=setInterval(load,30000);
    window.addEventListener('erp:data-saved',load);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('erp:data-saved',load);};
  },[refreshKey,phone,revision]);
  useEffect(()=>{
    if(!pending)return;
    const warn=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[pending]);
  async function loadRows(offset=0){
    setLoading(true);setError('');
    try{const {data}=await api.get('/credits',{timeout:90000,params:{...(phone?{phone}:{}),offset,limit:30}});setRows(old=>offset?[...old,...data.items]:data.items);setCount(data.count);}
    catch{setError('Credit invoices could not be loaded. Please retry.');}
    finally{setLoading(false);}
  }
  async function open(){setDetail(null);setNotice('');dialog.current.showModal();await loadRows();}
  async function select(id){
    if(pending)return;
    setError('');setLoading(true);setNotice('');
    try{const {data}=await api.get(`/credits/${id}`,{timeout:90000});setDetail(data);setAmount('');setMethod('cash');setReference('');setConfirmed(false);}
    catch{setError('Invoice details could not be loaded. Retry.');}
    finally{setLoading(false);}
  }
  async function collect(event){
    event.preventDefault();if(submitting.current)return;
    const request=pending || {saleId:detail.invoice.id,payload:{request_id:crypto.randomUUID(),payment:{method,tendered:amount,reference:method==='cash'?null:reference.trim(),confirmed}}};
    submitting.current=true;setBusy(true);setPending(request);setError('');
    try{
      await api.post(`/credits/${request.saleId}/collections`,request.payload,{timeout:90000});
      setPending(null);setConfirmed(false);setAmount('');setNotice('Payment recorded successfully.');
      window.dispatchEvent(new Event('erp:data-saved'));setRevision(v=>v+1);
      // A refresh failure must never turn a successful payment into a fresh payment retry.
      try{const {data}=await api.get(`/credits/${request.saleId}`,{timeout:90000});setDetail(data);}catch{setDetail(null);setNotice('Payment saved. Reopen the invoice for the updated balance.');}
      await loadRows();
    }catch(err){setError(message(err));if([400,403,404,422].includes(err.response?.status))setPending(null);}
    finally{setBusy(false);submitting.current=false;}
  }
  const valid= /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount)>0 && Number(amount)<=Number(detail?.credit.outstanding) && confirmed && (method==='cash'||reference.trim());
  return <section className={phone?'credit-customer':'credit-summary'}>
    <button type="button" className="today-sales-trigger credit-trigger" onClick={open}>
      <span className="today-sales-icon"><i className="fa-solid fa-wallet" aria-hidden="true" /></span>
      <span className="today-sales-copy"><span>{phone?'Previous credit for this mobile':'Total Credit'}</span><strong>{summary?money(summary.total_outstanding):balanceError?'Unavailable':'Loading…'}</strong></span>
      <span className="today-sales-caption">{phone?'View names and unpaid invoices':'All outstanding invoices · View customers'} <i className="fa-solid fa-chevron-right" aria-hidden="true" /></span>
    </button>
    {balanceError&&<p role="alert">{balanceError} <button type="button" onClick={()=>setRevision(v=>v+1)}>Retry</button></p>}
    {phone && summary && <p className="credit-combined">Previous credit {money(summary.total_outstanding)} + unpaid on this bill {money(currentUnpaid)} = <strong>Total due {money(Number(summary.total_outstanding)+currentUnpaid)}</strong></p>}
    {phone && <small>Shared numbers may include several customers. Choose the correct invoice before collecting payment. Previous credit is separate from this bill.</small>}
    <dialog ref={dialog} className="today-sales-dialog credit-dialog" aria-labelledby={phone?'customer-credit-title':'total-credit-title'} onCancel={event=>{if(pending||busy)event.preventDefault();}}>
      <header className="today-sales-header"><h2 id={phone?'customer-credit-title':'total-credit-title'}>{detail?number(detail.invoice.id):'Customer credit'}</h2><button type="button" className="today-sales-close" disabled={busy||Boolean(pending)} onClick={()=>dialog.current.close()} aria-label="Close credit">×</button></header>
      {error&&<p role="alert" className="dispense-error">{error}</p>}{notice&&<p role="status" className="dispense-success">{notice}</p>}
      {loading&&<p role="status">Loading credit records…</p>}
      {detail?<>
        <button type="button" disabled={busy||Boolean(pending)} onClick={()=>{setDetail(null);loadRows();}}>← All credit invoices</button>
        <p><strong>{detail.credit.customer_name}</strong> · {detail.credit.phone}</p>
        <p>Invoice total {money(detail.invoice.total_amount)} · Paid to date {money(detail.invoice.paid_amount)} · <strong>Outstanding {money(detail.credit.outstanding)}</strong></p>
        <p>{whatsappLabel(detail.invoice.whatsapp_status)}</p>
        {['failed','not_configured'].includes(detail.invoice.whatsapp_status)&&<button type="button" disabled={busy||Boolean(pending)} onClick={async()=>{
          setBusy(true);setError('');
          try{await api.post(`/credits/${detail.invoice.id}/notification/retry`);setDetail(old=>({...old,invoice:{...old.invoice,whatsapp_status:'queued'}}));}
          catch(err){setError(message(err));}finally{setBusy(false);}
        }}>Retry WhatsApp notification</button>}
        <button type="button" onClick={()=>printInvoice(detail.invoice,[],money)}>Print / Save invoice PDF</button>
        <div className="today-sales-table-wrap"><table className="today-sales-table"><thead><tr><th>Medicine</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>{detail.invoice.items.map(item=><tr key={item.id}><td>{item.medicine_name}<small>Batch {item.batch_number} · Expiry {item.expiry_date}</small></td><td>{item.quantity}</td><td>{money(item.line_total)}</td></tr>)}</tbody></table></div>
        <h3>Payment history</h3><p>At checkout: {money(detail.invoice.payment?.amount||0)} · {detail.invoice.payment?.method}</p>
        {detail.collections.map(entry=><p key={entry.request_id}>{saleDate(entry.created_at).toLocaleString()} · {entry.method} · {money(entry.amount)}{entry.reference&&` · ${entry.reference}`}</p>)}
        {Number(detail.credit.outstanding)>0&&<form className="credit-collection" onSubmit={collect}>
          <h3>Collect payment for {number(detail.invoice.id)}</h3>
          <fieldset disabled={busy||Boolean(pending)}>
            <label>Amount received<input required type="number" min="0.01" max={detail.credit.outstanding} step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}} /></label>
            <label>Payment method<select value={method} onChange={e=>{setMethod(e.target.value);setReference('');setConfirmed(false);}}>{[['cash','Cash'],['card','Card'],['upi','UPI'],['bank_transfer','Bank transfer']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            {method!=='cash'&&<label>Transaction reference<input required maxLength={100} value={reference} onChange={e=>{setReference(e.target.value);setConfirmed(false);}} /></label>}
            <label className="credit-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I confirm this payment has been received.</label>
          </fieldset>
          {pending&&!busy&&<p role="status">Keep this dialog open. Retry this exact payment to confirm its status safely.</p>}
          <button type="submit" disabled={busy||(!pending&&!valid)}>{busy?'Confirming…':pending?'Retry / confirm payment':'Record payment'}</button>
        </form>}
      </>:<>
        <p>Outstanding: <strong>{summary?money(summary.total_outstanding):'—'}</strong></p>
        <button type="button" disabled={loading} onClick={()=>loadRows()}>Refresh</button>
        <div className="today-sales-table-wrap"><table className="today-sales-table"><thead><tr><th>Customer / Mobile</th><th>Invoice / Date</th><th>Outstanding</th></tr></thead><tbody>{rows.map(c=><tr key={c.sale_id}><td>{c.customer_name}<small>{c.phone}</small></td><td><button type="button" disabled={loading} className="today-sales-invoice-link" onClick={()=>select(c.sale_id)}>{number(c.sale_id)}</button><small>{saleDate(c.created_at).toLocaleDateString()}</small></td><td>{money(c.outstanding)}</td></tr>)}</tbody></table></div>
        {!loading&&!error&&!rows.length&&<p>No outstanding credit.</p>}
        {rows.length<count&&<button type="button" disabled={loading} onClick={()=>loadRows(rows.length)}>Load more</button>}
      </>}
    </dialog>
  </section>;
}
