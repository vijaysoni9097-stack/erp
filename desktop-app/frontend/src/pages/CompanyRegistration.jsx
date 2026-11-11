import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export default function CompanyRegistration() {
  const [company, setCompany] = useState({company_name:'',address:'',gstin:''});
  const [role, setRole] = useState('');
  const [registered, setRegistered] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const canEdit = loaded && (role === 'superadmin' || (role === 'admin' && !registered));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setLoaded(false);setError('');
    Promise.all([api.get('/settings/company',{signal:controller.signal}),api.get('/auth/me',{signal:controller.signal})]).then(([data,profile])=>{
      if(controller.signal.aborted)return;
      setCompany(Object.fromEntries(['company_name','address','gstin'].map(key=>[key,data.data[key]||''])));
      setRole(profile.data.role);setRegistered(data.data.registered ?? Boolean(data.data.company_name));setLoaded(true);
    }).catch(err=>{if(!controller.signal.aborted)setError(err.response?.status===404 ? 'Company Registration is not available on this server yet. Deploy the updated backend before entering details.' : 'Company registration could not be loaded. Please reload and try again.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[reload]);
  async function save(event){
    event.preventDefault();if(lock.current || !canEdit)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try {const {data}=await api.put('/settings/company',company);setCompany(Object.fromEntries(['company_name','address','gstin'].map(key=>[key,data[key]||''])));setRegistered(true);setNotice('Company registration saved. New invoices will use these details.');}
    catch(err){setError(typeof err.response?.data?.detail==='string'?err.response.data.detail:'Could not save. Check the company details and GSTIN format.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={save}><h2>Company Registration</h2><p className="inline-note">The company that registered or purchased this software. Admins can save the initial details. Once saved, only a superadmin can edit them. Company details appear on new invoices; existing invoices remain unchanged.</p>{loading?<p role="status">Loading company details…</p>:<fieldset disabled={!canEdit||busy||!loaded}><div className="settings-row">{[['company_name','Company name'],['address','Registered address'],['gstin','GSTIN']].map(([key,label])=><div className="field-group" key={key}><label htmlFor={`company-${key}`}>{label}</label>{key==='address'?<textarea id={`company-${key}`} maxLength={1000} value={company[key]} onChange={e=>setCompany({...company,[key]:e.target.value})}/>:<input id={`company-${key}`} required={key==='company_name'} maxLength={key==='gstin'?15:150} pattern={key==='gstin'?'[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]':undefined} value={company[key]} onChange={e=>setCompany({...company,[key]:key==='gstin'?e.target.value.toUpperCase():e.target.value})}/>}</div>)}</div>{canEdit&&<div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy?'Saving…':registered?'Update Company':'Save Company'}</button></div>}</fieldset>}{error&&<p role="alert">{error} <button type="button" onClick={()=>setReload(v=>v+1)}>Reload</button></p>}{notice&&<p role="status">{notice}</p>}{!loading&&loaded&&!canEdit&&<p className="inline-note">{registered?'Company registration is saved. Only a superadmin can edit or update it.':'An admin or superadmin can register this company.'}</p>}</form>;
}
