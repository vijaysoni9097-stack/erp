import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api} from './src/services/api';
import CreditAccounts from './src/components/CreditAccounts';
import {CurrencyProvider} from './src/contexts/CurrencyContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import './src/index.css';
import './src/App.css';
import './src/styles/TodaySales.css';
const invoices=[{sale_id:101,customer_name:'Preview Customer',outstanding:'100.10',created_at:'2026-10-30T10:00:00Z'}, {sale_id:102,customer_name:'Preview Customer',outstanding:'200.20',created_at:'2026-10-31T10:00:00Z'}, {sale_id:103,customer_name:'Another Customer',outstanding:'50',created_at:'2026-10-31T10:00:00Z'}];
let fail=true;
api.get=async(url)=>{
 if(url==='/settings/profile')return {data:{country:'India',currency:'INR'}};
 if(url==='/suppliers')return {data:[]};
 if(url==='/credits')return {data:{items:invoices.filter(i=>Number(i.outstanding)>0),count:invoices.filter(i=>Number(i.outstanding)>0).length,total_outstanding:invoices.reduce((n,i)=>n+Number(i.outstanding),0)}};
 const item=invoices.find(i=>i.sale_id===Number(url.split('/').at(-1)));
 return {data:{credit:item,invoice:{id:item.sale_id,items:[],total_amount:item.outstanding,paid_amount:0},collections:[]}};
};
api.post=async(url,payload)=>{
 if(fail){fail=false;throw new Error('Simulated timeout');}
 for(const item of payload.allocations||[{sale_id:Number(url.split('/')[2]),amount:payload.payment.tendered}]){
  const invoice=invoices.find(i=>i.sale_id===item.sale_id);
  invoice.outstanding=(Number(invoice.outstanding)-Number(item.amount)).toFixed(2);
 }
 return {data:{}};
};
function Preview(){const [locked,setLocked]=useState(false);return <CurrencyProvider profile={{currency:'INR'}}><main style={{maxWidth:560,margin:'28px auto',padding:20}}><h2>Credit payment preview</h2><p>Isolated sample data</p><CreditAccounts phone="+919000000000" customerName="Preview Customer" onCollectionLockChange={setLocked}/><button disabled={locked}>Complete new sale</button></main></CurrencyProvider>;}
createRoot(document.getElementById('root')).render(<Preview/>);
