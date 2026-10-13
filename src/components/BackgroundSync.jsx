import { useEffect } from 'react';
import { api } from '../services/api';

export default function BackgroundSync() {
  useEffect(() => {
    let cancelled = false;
    let timer;
    let delay = 30000;
    const tick = async () => {
      try {
        const { data } = await api.get('/sync/status');
        if (!cancelled && data.enabled) await api.post('/sync/run', {}, { timeout: 120000 });
        delay = 30000;
      } catch { delay = Math.min(delay * 2, 300000); }
      if (!cancelled) timer = setTimeout(tick, delay + Math.random() * 3000);
    };
    timer = setTimeout(tick, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  return null;
}
