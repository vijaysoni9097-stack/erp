import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { resolveCurrency } from '../services/currency';

const CurrencyContext = createContext(resolveCurrency());
export const useCurrency = () => useContext(CurrencyContext);

export function CurrencyProvider({ profile, children }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('erp:suppliers-updated', refresh);
    return () => window.removeEventListener('erp:suppliers-updated', refresh);
  }, []);
  const [details, setDetails] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.get('/settings/profile', { signal: controller.signal }),
      api.get('/suppliers', { signal: controller.signal, timeout: 90000 }),
    ]).then(([savedProfile, supplierList]) => {
      if (controller.signal.aborted) return;
      setDetails(savedProfile.status === 'fulfilled' ? savedProfile.value.data : null);
      setSuppliers(supplierList.status === 'fulfilled' ? supplierList.value.data : []);
    });
    return () => controller.abort();
  }, [profile, revision]);
  const value = useMemo(() => resolveCurrency({ ...profile, ...details }, suppliers), [details, profile, suppliers]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
