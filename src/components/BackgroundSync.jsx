import { useEffect } from 'react';
import { api } from '../services/api';

export default function BackgroundSync() {
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let active = false;
    let again = false;
    let forceNext = false;
    const wake = async () => {
      if (active) { again = true; return; }
      if (controller.signal.aborted) return;
      active = true;
      const force = forceNext; forceNext = false;
      try {
        await api.post('/sync/wake', { force }, { signal: controller.signal });
        if (!controller.signal.aborted) window.dispatchEvent(new Event('erp:sync-status'));
      } catch { /* The durable backend worker continues retrying without the UI. */ }
      finally {
        active = false;
        if (again && !controller.signal.aborted) { again = false; schedule(); }
      }
    };
    const schedule = (force = false) => {
      forceNext ||= force;
      clearTimeout(timer);
      timer = setTimeout(wake, 300);
    };
    const online = () => schedule(true);
    const changed = () => schedule();
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    window.addEventListener('erp:data-saved', changed);
    const poll = setInterval(changed, 30000);
    schedule(true);
    return () => {
      controller.abort(); clearTimeout(timer); clearInterval(poll);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
      window.removeEventListener('erp:data-saved', changed);
    };
  }, []);
  return null;
}
