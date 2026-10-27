// Checkout values are validated again against current prices by the API.
export function checkoutPayment({mode, method, received, total, confirmed, reference, phone}) {
  const tendered=mode==='credit'?0:mode==='partial'||method==='cash'?Number(received):total;
  const outstanding=Math.max(0,Math.round((total-tendered)*100)/100);
  const precise=Number.isFinite(tendered)&&tendered>=0&&Number.isSafeInteger(Math.round(tendered*100))&&Math.abs(tendered*100-Math.round(tendered*100))<0.00001;
  const valid=precise&&(mode==='credit'?total>0:mode==='partial'?received!==''&&tendered>0&&tendered<total: (method!=='cash'||received!=='')&&tendered>=total)&&
    (tendered===0||confirmed)&&(tendered===0||method==='cash'||Boolean(reference.trim()))&&(outstanding===0||Boolean(phone));
  return {tendered,outstanding,valid};
}
