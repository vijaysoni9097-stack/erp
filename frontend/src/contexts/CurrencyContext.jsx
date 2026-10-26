import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { resolveCurrency } from '../services/currency';

const pendingCurrency = { ...resolveCurrency(), currency: '…', symbol: '…', formatMoney: () => '…' };
const CurrencyContext = createContext(pendingCurrency);
export const useCurrency = () => useContext(CurrencyContext);

export function CurrencyProvider({ profile, children }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('erp:suppliers-updated', refresh);
    return () => window.removeEventListener('erp:suppliers-updated', refresh);
  }, []);
  const [currency, setCurrency] = useState(pendingCurrency);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.get('/settings/profile', { signal: controller.signal }),
      api.get('/suppliers', { signal: controller.signal, timeout: 90000 }),
    ]).then(([savedProfile, supplierList]) => {
      if (controller.signal.aborted) return;
      setCurrency(resolveCurrency(
        { ...profile, ...(savedProfile.status === 'fulfilled' ? savedProfile.value.data : {}) },
        supplierList.status === 'fulfilled' ? supplierList.value.data : [],
      ));
    });
    return () => controller.abort();
  }, [profile, revision]);
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}
