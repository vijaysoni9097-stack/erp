export function normalizeCustomerMobile(value) {
  const text=String(value||'').trim();
  if(!text)return '';
  if(!/^\+?[0-9 ()\-.]+$/.test(text))return null;
  let digits=text.replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  else if(digits.length===10&&!text.startsWith('+'))digits='91'+digits;
  return digits.length>=7&&digits.length<=15?'+'+digits:null;
}
