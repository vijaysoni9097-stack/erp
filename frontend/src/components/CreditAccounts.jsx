import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useCurrency } from '../contexts/CurrencyContext';
import { printInvoice } from '../services/printInvoice';
import { invoiceLabel as number } from '../services/invoiceLabel';
import { saleDate } from '../services/dailySales';
import { customerDues, duesTotal, loadCustomerDues } from '../services/creditPayment';
import '../styles/CreditAccounts.css';

export const whatsappLabel = status => ({queued:'WhatsApp notification queued',not_configured:'WhatsApp not configured — notification not sent',no_consent:'WhatsApp not sent — customer consent not recorded',sending:'Sending WhatsApp notification',accepted:'WhatsApp accepted by provider (delivery not confirmed)',failed:'WhatsApp failed — check provider configuration',unknown:'WhatsApp status uncertain — verify with provider'}[status] || '');
const message = error => typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Could not confirm payment. Retry the same payment to check safely.';

export default function CreditAccounts({ refreshKey, phone = null, currentUnpaid = 0, customerName = '', onCollectionLockChange, checkoutLocked = false }) {
  const {formatMoney:money} = useCurrency();
  const [summary,setSummary]=useState(null), [rows,setRows]=useState([]), [count,setCount]=useState(0);
  const [balanceError,setBalanceError]=useState('');
  const [error,setError]=useState(''), [detail,setDetail]=useState(null), [loading,setLoading]=useState(false);
  const [amount,setAmount]=useState(''), [method,setMethod]=useState('cash'), [reference,setReference]=useState('');
  const [confirmed,setConfirmed]=useState(false), [busy,setBusy]=useState(false), [pending,setPending]=useState(null), [revision,setRevision]=useState(0), [notice,setNotice]=useState('');
  const [inlinePayment,setInlinePayment]=useState(false);
  const [selectedDues,setSelectedDues]=useState(null);
  const repaymentFormId=useId();
  const dialog=useRef(null), submitting=useRef(false);
  useEffect(()=>{onCollectionLockChange?.(busy||Boolean(pending)||inlinePayment);},[busy,pending,inlinePayment,onCollectionLockChange]);
  useEffect(()=>{if(!pending&&!busy){setInlinePayment(false);setSelectedDues(null);setDetail(null);setNotice('');setError('');}},[customerName]);
  useEffect(()=>{
    const controller=new AbortController();
    setSummary(null);
    const load=()=>api.get(phone ? '/credits' : '/credits/summary',{timeout:90000,signal:controller.signal,params:phone?{phone,limit:100}:undefined})
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
  async function open(){if(pending||busy||loading||inlinePayment||checkoutLocked)return;setSelectedDues(null);setDetail(null);setNotice('');dialog.current.showModal();await loadRows();}
  async function select(id,inline=false){
    if(pending||busy||loading||inlinePayment||checkoutLocked)return;
    setInlinePayment(inline);
    setSelectedDues(null);
    setError('');setLoading(true);setNotice('');
    try{const {data}=await api.get(`/credits/${id}`,{timeout:90000});setDetail(data);setAmount('');setMethod('cash');setReference('');setConfirmed(false);}
    catch{setError('Invoice details could not be loaded. Retry.');}
    finally{setLoading(false);}
  }
  async function selectAll(){
    if(pending||busy||loading||inlinePayment||checkoutLocked)return;
    setInlinePayment(true);setDetail(null);setLoading(true);setError('');setNotice('');
    try{
      const invoices=await loadCustomerDues(api.get,phone,customerName);
      if(!invoices.length){setInlinePayment(false);setRevision(v=>v+1);setNotice('No unpaid dues remain for this customer.');return;}
      setSelectedDues(invoices);setAmount(duesTotal(invoices).toFixed(2));setMethod('cash');setReference('');setConfirmed(false);
    }catch{setError('Customer dues could not be loaded. Close the payment and retry.');}
    finally{setLoading(false);}
  }
  function closeSelection(){
    if(checkoutLocked||loading||busy||pending)return;
    setInlinePayment(false);setSelectedDues(null);setDetail(null);setAmount('');setConfirmed(false);setError('');setNotice('');
  }
  async function collect(event){
    event.preventDefault();event.stopPropagation();if(submitting.current || checkoutLocked || (!pending && !valid))return;
    const request=pending || {saleId:selectedDues?null:detail.invoice.id,payload:{request_id:crypto.randomUUID(),payment:{method,tendered:amount,reference:method==='cash'?null:reference.trim(),confirmed},...(selectedDues?{allocations:selectedDues.map(invoice=>({sale_id:invoice.sale_id,amount:Number(invoice.outstanding).toFixed(2)}))}:{})}};
    submitting.current=true;setBusy(true);setPending(request);setError('');
    try{
      await api.post(request.saleId?`/credits/${request.saleId}/collections`:'/credits/collections',request.payload,{timeout:90000});
      setPending(null);setConfirmed(false);setAmount('');setNotice('Payment recorded successfully.');
      window.dispatchEvent(new Event('erp:data-saved'));setRevision(v=>v+1);
      // A refresh failure must never turn a successful payment into a fresh payment retry.
      if(!request.saleId){setSelectedDues(null);setInlinePayment(false);setDetail(null);setNotice('Payment recorded. All selected dues are fully paid.');}
      else try{const {data}=await api.get(`/credits/${request.saleId}`,{timeout:90000});setDetail(data);}catch{setDetail(null);setNotice('Payment saved. Reopen the invoice for the updated balance.');}
      await loadRows();
    }catch(err){setError(message(err));if([400,403,404,422].includes(err.response?.status))setPending(null);}
    finally{setBusy(false);submitting.current=false;}
  }
  const customerInvoices=customerDues(summary?.items||[],customerName);
  const outstanding=selectedDues?duesTotal(selectedDues):Number(detail?.credit.outstanding);
  const selectionDisabled=checkoutLocked||loading||busy||Boolean(pending)||inlinePayment;
  const valid= /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount)>0 && Number(amount)<=outstanding && (!selectedDues||Number(amount)===outstanding) && confirmed && (method==='cash'||reference.trim());
  const paymentFields=(detail||selectedDues) && <>
          <fieldset disabled={checkoutLocked||busy||Boolean(pending)}>
            <label>Amount received<input form={inlinePayment?repaymentFormId:undefined} required type="number" min="0.01" max={outstanding} step="0.01" readOnly={Boolean(selectedDues)} value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}} /></label>
            <label>Payment method<select form={inlinePayment?repaymentFormId:undefined} value={method} onChange={e=>{setMethod(e.target.value);setReference('');setConfirmed(false);}}>{[['cash','Cash'],['card','Card'],['upi','UPI'],['bank_transfer','Bank transfer']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            {method!=='cash'&&<label>Transaction reference<input form={inlinePayment?repaymentFormId:undefined} required maxLength={100} value={reference} onChange={e=>{setReference(e.target.value);setConfirmed(false);}} /></label>}
            <label className="credit-check"><input form={inlinePayment?repaymentFormId:undefined} type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I confirm this payment has been received.</label>
          </fieldset>
          {pending&&!busy&&<p role="status">Keep this dialog open. Retry this exact payment to confirm its status safely.</p>}
          <button className="credit-primary" type={inlinePayment?'button':'submit'} onClick={inlinePayment?collect:undefined} disabled={checkoutLocked||busy||(!pending&&!valid)}>{busy?'Confirming…':pending?'Retry / confirm payment':selectedDues?`Pay all selected dues · ${money(outstanding)}`:'Record payment'}</button>
  </>;
  return <section className={phone?'credit-customer':'credit-summary'}>
    <button type="button" className="today-sales-trigger credit-trigger" disabled={selectionDisabled} onClick={open}>
      <span className="today-sales-icon"><i className="fa-solid fa-wallet" aria-hidden="true" /></span>
      <span className="today-sales-copy"><span>{phone?'Previous credit for this mobile':'Total Credit'}</span><strong>{summary?money(summary.total_outstanding):balanceError?'Unavailable':'Loading…'}</strong></span>
      <span className="today-sales-caption">{phone?'View names and unpaid invoices':'All outstanding invoices · View customers'} <i className="fa-solid fa-chevron-right" aria-hidden="true" /></span>
    </button>
    {balanceError&&<p role="alert">{balanceError} <button type="button" onClick={()=>setRevision(v=>v+1)}>Retry</button></p>}
    {phone && summary && <p className="credit-combined">Previous credit {money(summary.total_outstanding)} + unpaid on this bill {money(currentUnpaid)} = <strong>Total due {money(Number(summary.total_outstanding)+currentUnpaid)}</strong></p>}
    {phone && customerName.trim() && summary && (Number(summary.total_outstanding)>0 || inlinePayment || notice) && <section className="credit-inline-dues" aria-label="Previous dues for this customer">
      <div className="credit-inline-heading"><div><span className="credit-eyebrow">Customer account</span><h3>Pay previous dues</h3></div><span className="credit-account-name">{customerName}</span></div>
      {(customerInvoices.length>1||summary.count>100)&&<button type="button" className="credit-select-all" aria-pressed={Boolean(selectedDues)} disabled={selectionDisabled} onClick={selectAll}>{selectedDues?'All dues selected':'Select all dues'}</button>}
      {customerInvoices.length ? <>
        <p>Choose one invoice for a partial or full payment, or select all dues for {customerName}. Close the payment to change your selection.</p>
        <div className="credit-due-list">{customerInvoices.map(invoice=>{
          const selected=inlinePayment&&(selectedDues?.some(item=>item.sale_id===invoice.sale_id)||detail?.invoice.id===invoice.sale_id);
          return <div className={`credit-due-row${selected?' is-selected':''}`} key={invoice.sale_id}><div><strong>{number(invoice)}</strong><small>{saleDate(invoice.created_at).toLocaleDateString()} · Due {money(invoice.outstanding)}</small></div><button type="button" aria-pressed={Boolean(selected)} disabled={selectionDisabled} onClick={()=>select(invoice.sale_id,true)}>{selected?'Selected':'Pay this due'}</button></div>;
        })}</div>
        {summary.count>100&&<button type="button" disabled={selectionDisabled} onClick={open}>View all outstanding invoices</button>}
      </> : <p>{summary.count>100?'Open all invoices to find earlier dues for this customer.':'No unpaid invoices under this name in the loaded records. Other people may share this mobile; check the account before collecting.'}</p>}
      {inlinePayment && <div className="credit-inline-payment">
        <div className="credit-inline-heading"><h3>{selectedDues?`${selectedDues.length} invoices selected · ${money(outstanding)} due`:detail?`${number(detail.invoice)} · ${money(detail.credit.outstanding)} due`:'Select payment'}</h3><button type="button" disabled={checkoutLocked||loading||busy||Boolean(pending)} onClick={closeSelection}>Close payment</button></div>
        {loading?<p role="status">Loading dues…</p>:selectedDues?<>
          <p className="credit-selection-hint">This payment clears all selected invoices for {customerName}. Other customers sharing this mobile are excluded.</p>
          <div className="credit-due-list" aria-label="Selected invoices">{selectedDues.map(invoice=><div className="credit-due-row" key={invoice.sale_id}><strong>{number(invoice)}</strong><span>{money(invoice.outstanding)}</span></div>)}</div>
          <div className="credit-collection">{paymentFields}</div>
        </>:detail&&<>
          {Number(detail.credit.outstanding)>0?<div className="credit-collection">{paymentFields}</div>:<p className="credit-notice">This previous invoice is fully paid.</p>}
          <button type="button" className="credit-secondary" onClick={()=>printInvoice(detail.invoice,[],money)}>Print updated invoice / Save PDF</button>
        </>}
        {error&&<p className="credit-error" role="alert">{error}</p>}{notice&&<p className="credit-notice" role="status">{notice}</p>}
      </div>}
      {!inlinePayment&&notice&&<p className="credit-notice" role="status">{notice}</p>}
    </section>}
    {phone && <small>Shared numbers may include several customers. Previous payments reduce their original invoices; the new medicine bill stays separate.</small>}
    {createPortal(<><form id={repaymentFormId} onSubmit={collect} hidden />
    <dialog ref={dialog} className="today-sales-dialog credit-dialog" aria-labelledby={phone?'customer-credit-title':'total-credit-title'} onCancel={event=>{if(pending||busy)event.preventDefault();}}>
      <header className="today-sales-header"><div><span className="credit-eyebrow">Payments & receivables</span><h2 id={phone?'customer-credit-title':'total-credit-title'}>{detail?number(detail.invoice):'Customer credit'}</h2></div><button type="button" className="today-sales-close" disabled={checkoutLocked||busy||Boolean(pending)} onClick={()=>dialog.current.close()} aria-label="Close credit">×</button></header>
      <div className="credit-dialog-body">
      {error&&<p role="alert" className="credit-error">{error}</p>}{notice&&<p role="status" className="credit-notice">{notice}</p>}
      {loading&&<p role="status">Loading credit records…</p>}
      {detail&&!inlinePayment?<>
        <button type="button" disabled={checkoutLocked||busy||Boolean(pending)} onClick={()=>{setDetail(null);loadRows();}}>← All credit invoices</button>
        <div className="credit-person"><span className="today-sales-icon"><i className="fa-solid fa-user" aria-hidden="true" /></span><div><strong>{detail.credit.customer_name}</strong><small>{detail.credit.phone}</small></div></div>
        <div className="credit-stats"><div><span>{detail.invoice.import_details?.kind === 'opening_balances' ? 'Opening balance' : 'Invoice total'}</span><strong>{money(detail.invoice.total_amount)}</strong></div><div><span>Paid to date</span><strong>{money(detail.invoice.paid_amount)}</strong></div><div><span>Outstanding</span><strong>{money(detail.credit.outstanding)}</strong></div></div>
        <p>{whatsappLabel(detail.invoice.whatsapp_status)}</p>
        {['failed','not_configured'].includes(detail.invoice.whatsapp_status)&&<button type="button" disabled={checkoutLocked||busy||Boolean(pending)} onClick={async()=>{
          setBusy(true);setError('');
          try{await api.post(`/credits/${detail.invoice.id}/notification/retry`);setDetail(old=>({...old,invoice:{...old.invoice,whatsapp_status:'queued'}}));}
          catch(err){setError(message(err));}finally{setBusy(false);}
        }}>Retry WhatsApp notification</button>}
        <button type="button" onClick={()=>printInvoice(detail.invoice,[],money)}>Print / Save invoice PDF</button>
        {detail.invoice.import_details?.kind === 'opening_balances' ? <p>Customer debt brought forward from the previous software.</p> : <><div className="today-sales-table-wrap"><table className="today-sales-table"><thead><tr><th>Medicine</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>{detail.invoice.items.map(item=><tr key={item.id}><td>{item.medicine_name}<small>Batch {item.batch_number} · Expiry {item.expiry_date}</small></td><td>{item.quantity}</td><td>{money(item.line_total)}</td></tr>)}</tbody></table></div></>}
        <h3>Payment history</h3>
        {detail.invoice.import_details && <p>Balance snapshot at {saleDate(detail.invoice.import_details.balance_as_of).toLocaleString()}. Paid before migration, excluding recorded checkout payment: {money(detail.invoice.import_details.paid_before_import)}.</p>}
        {detail.invoice.payment ? <p>At checkout: {money(detail.invoice.payment.amount)} · {detail.invoice.payment.method}</p> : <p>Original checkout payment not recorded.</p>}
        {detail.collections.map(entry=><p key={entry.request_id}>{saleDate(entry.created_at).toLocaleString()} · {entry.method} · {money(entry.amount)}{entry.reference&&` · ${entry.reference}`}</p>)}
        {Number(detail.credit.outstanding)>0&&<form className="credit-collection" onSubmit={collect}>
          <h3>Collect payment for {number(detail.invoice)}</h3>
          {paymentFields}
        </form>}
      </>:<>
        <p>Outstanding: <strong>{summary?money(summary.total_outstanding):'—'}</strong></p>
        <button type="button" disabled={loading} onClick={()=>loadRows()}>Refresh</button>
        <div className="today-sales-table-wrap"><table className="today-sales-table"><thead><tr><th>Customer / Mobile</th><th>Invoice / Date</th><th>Outstanding</th></tr></thead><tbody>{rows.map(c=><tr key={c.sale_id}><td>{c.customer_name}<small>{c.phone}</small></td><td><button type="button" disabled={loading} className="today-sales-invoice-link" onClick={()=>select(c.sale_id)}>{number(c)}</button><small>{saleDate(c.created_at).toLocaleDateString()}</small></td><td>{money(c.outstanding)}</td></tr>)}</tbody></table></div>
        {!loading&&!error&&!rows.length&&<p>No outstanding credit.</p>}
        {rows.length<count&&<button type="button" disabled={loading} onClick={()=>loadRows(rows.length)}>Load more</button>}
      </>}
      </div>
    </dialog></>,document.body)}
  </section>;
}
