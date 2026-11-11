// Publish sales/stock as soon as available; repayment failures must not hide them.
export async function refreshDashboard(api, signal, publish, now = new Date()) {
  const names=['medicines','sales','purchase-orders','prescriptions','customers','suppliers'];
  const keys=['medicines','sales','orders','prescriptions','customers','suppliers'];
  const start=new Date(now);start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const creditRequest=api.get('/credits/summary',{signal,timeout:90000,params:{from_at:start.toISOString(),to_at:end.toISOString()}})
    .then(({data})=>({data}),error=>({error}));
  const responses=await Promise.all(names.map(name=>api.get(`/${name}`,{signal,timeout:90000})));
  if(signal.aborted)return;
  if(responses.some(response=>!Array.isArray(response.data)))throw new Error('Invalid dashboard data');
  const core=Object.fromEntries(keys.map((key,i)=>[key,responses[i].data]));
  publish({...core,creditCollections:{},creditCollectionsAvailable:false,creditCollectionsPending:true});
  const result=await creditRequest;
  if(signal.aborted)return;
  const collections=result.data?.collections;
  const valid=!result.error && collections && typeof collections==='object' && !Array.isArray(collections) &&
    Object.values(collections).every(value=>value!==null && Number.isFinite(Number(value)) && Number(value)>=0);
  publish({...core,creditCollections:valid?collections:{},creditCollectionsAvailable:Boolean(valid),creditCollectionsPending:false});
  return valid ? '' : 'Sales and stock refreshed. Credit repayment totals could not load; collection totals are unavailable. Retry refresh.';
}
