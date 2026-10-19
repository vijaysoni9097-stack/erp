import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import '../styles/Settings.css';

export default function Sync() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { const { data } = await api.get('/sync/status'); setStatus(data); setError(''); }
    catch (err) { setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to read synchronization status.'); }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener('erp:sync-status', refresh);
    return () => { clearInterval(timer); window.removeEventListener('erp:sync-status', refresh); };
  }, [refresh]);

  async function resolve(operation, choice) {
    if (choice === 'accept_cloud' && !window.confirm('Discard all your pending edits to this record and use the cloud version?')) return;
    setBusy(true); setError('');
    try { await api.post(`/sync/conflicts/${operation}`, { choice }); await api.post('/sync/wake', { force: true }); await refresh(); }
    catch (err) { setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to resolve this conflict.'); }
    finally { setBusy(false); }
  }
  const direct = status?.mode === 'cloud_database';
  return <div className="settings-page">
    <div className="settings-header"><h1>Synchronization</h1></div>
    {error && <p role="alert" className="login-error">{error}</p>}
    {!status ? <p role="status">Loading synchronization status…</p> : <section className="settings-card"><div className="w-100">
      <h2>{direct ? 'Cloud saves are automatic' : status.enabled ? 'Automatic synchronization is on' : 'Local storage is active'}</h2>
      {direct ? <p>Medicines, purchase orders, invoices and other changes are saved directly to the shared cloud database. There is no manual upload step.</p>
        : status.enabled ? <p>Changes are saved locally first and uploaded automatically when the cloud is reachable. Queued changes retry after a connection returns, even when this page is closed.</p>
        : <p>This installation needs one-time device enrollment before cloud synchronization can start. Your data continues to be saved on this computer.</p>}
      <dl className="mt-3">
        <dt>Pending uploads</dt><dd>{status.pending}</dd>
        <dt>Conflicts to review</dt><dd>{status.conflicts.length}</dd>
        <dt>Last synchronized</dt><dd>{direct ? 'Saved directly on every successful change' : status.last_synced_at ? new Date(`${status.last_synced_at}Z`).toLocaleString() : 'Waiting for the first automatic sync'}</dd>
        {status.lease_expires_at && <><dt>Offline access available until</dt><dd>{new Date(`${status.lease_expires_at}Z`).toLocaleString()}</dd></>}
      </dl>
      {status.enabled && !status.connected && <p role="status">Sign out using your profile menu and sign in once to authorize this device. After that, reconnection and token renewal happen automatically.</p>}
      {status.error && <p role="status">{status.error} Temporary connection failures retry automatically; saved changes stay queued.</p>}
      {status.enabled && <p>Offline sales continue to use this device’s allocated stock. Conflicting edits and revoked access still require review.</p>}
      {status.conflicts.map(conflict => <div className="settings-section mt-4" key={conflict.operation_id}><strong>{conflict.entity}</strong><p>{conflict.message}</p><div className="d-flex gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={() => resolve(conflict.operation_id, 'keep_local')}>Keep My Changes</button><button type="button" className="secondary-button" disabled={busy} onClick={() => resolve(conflict.operation_id, 'accept_cloud')}>Use Cloud Version</button></div></div>)}
    </div></section>}
  </div>;
}
