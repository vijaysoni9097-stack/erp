import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { isExpiringSoon } from '../services/expiry';
import '../styles/ExpiryTicker.css';

export default function ExpiryTicker({ profile }) {
  const [items, setItems] = useState([]);
  const [paused, setPaused] = useState(false);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const { data } = await api.get('/medicines', { signal: controller.signal, timeout: 90000 });
        if (!Array.isArray(data)) throw new Error('Invalid medicine catalog');
        if (!controller.signal.aborted) {
          setItems(data.filter(m => isExpiringSoon(m)).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)));
          setStale(false);
        }
      } catch { if (!controller.signal.aborted) setStale(true); }
      finally { busy = false; }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    const events = ['focus', 'erp:data-saved'];
    events.forEach(event => window.addEventListener(event, refresh));
    return () => { controller.abort(); clearInterval(timer); events.forEach(event => window.removeEventListener(event, refresh)); };
  }, []);
  if (!items.length) return null;
  const text = items.map(item => `${item.name} · Batch ${item.batch_number} · Exp. ${item.expiry_date} · ${item.stock_quantity} units`).join('     •     ');
  return <div className="expiry-ticker-space"><aside className={`expiry-ticker ${paused ? 'is-paused' : ''}`} aria-label="Medicines expiring within 30 days">
    <Link to={profile?.role === 'pharmacist' ? '/medicines' : '/expiry-alerts'} className="expiry-ticker-label"><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Expiring soon ({items.length}){stale && <small>Last loaded data</small>}</Link>
    <div className="expiry-ticker-window"><div className="expiry-ticker-track" style={{ '--ticker-duration': `${Math.max(25, text.length / 9)}s` }}><span>{text}</span><span aria-hidden="true">{text}</span></div></div>
    <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume expiry ticker' : 'Pause expiry ticker'} aria-pressed={paused}><i className={`fa-solid ${paused ? 'fa-play' : 'fa-pause'}`} aria-hidden="true" /></button>
  </aside></div>;
}
