import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
export default function BillingDetails() {
  const [company,setCompany]=useState(null);
  const [error,setError]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError(false);api.get('/settings/company',{signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setCompany(data);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[revision]);
  return <div className="dispense-gstin"><span><strong>{company?.company_name||'Company registration'}</strong> · GSTIN: {error?'Unavailable':company?company.gstin||'Not configured':'Loading…'}</span><Link to="/settings/company">Company details</Link>{error&&<button type="button" onClick={()=>setRevision(v=>v+1)}>Reload</button>}</div>;
}
