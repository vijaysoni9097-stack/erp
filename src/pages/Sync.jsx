import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import '../styles/Settings.css';

export default function Sync() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [progress, setProgress] = useState('');
  const refresh = useCallback(async () => {
    try { const { data } = await api.get('/sync/status'); setStatus(data); }
    catch (err) { setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to read synchronization status.'); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  async function run() {
    setBusy(true); setError('');
    try {
      let previous = status.pending;
      while (true) {
        await api.post('/sync/run', {}, { timeout: 120000 });
        const { data } = await api.get('/sync/status');
        setStatus(data);
        setProgress(`${data.pending} uploads remaining`);
        if (data.pending === 0 || data.conflicts.length || data.pending >= previous) break;
        previous = data.pending;
      }
    }
    catch (err) { setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Cloud is unavailable. Your pending changes remain saved locally.'); }
    finally { await refresh(); setBusy(false); }
  }
  async function reconnect(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api.post('/sync/reconnect', { password }, { timeout: 45000 });
      setPassword(''); await refresh();
    } catch (err) {
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to reconnect. Please try again.');
    } finally { setPassword(''); setBusy(false); }
  }
  async function resolve(operation, choice) {
    if (choice === 'accept_cloud' && !window.confirm('Discard all your pending edits to this record and use the cloud version?')) return;
    setBusy(true); setError('');
    try { await api.post(`/sync/conflicts/${operation}`, { choice }); await refresh(); }
    catch (err) { setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to resolve this conflict.'); }
    finally { setBusy(false); }
  }
  return <div className="settings-page">
    <div className="settings-header"><h1>Synchronization</h1></div>
    {error && <p role="alert" className="login-error">{error}</p>}
    {!status ? <p role="status">Loading synchronization status…</p> : <section className="settings-card"><div className="w-100">
      <h2>{status.enabled ? 'Cloud synchronization' : 'Local storage is active'}</h2>
      {!status.enabled && <p>Cloud synchronization is awaiting device enrollment. Your data continues to be saved on this computer.</p>}
      <dl>
        <dt>Pending uploads</dt><dd>{status.pending}</dd>
        <dt>Conflicts to review</dt><dd>{status.conflicts.length}</dd>
        <dt>Last synchronized</dt><dd>{status.last_synced_at ? new Date(`${status.last_synced_at}Z`).toLocaleString() : 'Not yet synchronized'}</dd>
        {status.lease_expires_at && <><dt>Offline access available until</dt><dd>{new Date(`${status.lease_expires_at}Z`).toLocaleString()}</dd></>}
      </dl>
      {status.error && <p role="alert">{status.error}</p>}
      {status.enabled && !status.connected && <form onSubmit={reconnect}>
        <p>Reconnect to continue uploading your saved changes.</p>
        <label>Cloud password <input type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="primary-button" disabled={busy}>Reconnect</button>
      </form>}
      {progress && <p role="status">{progress}</p>}
      <p>Offline sales use this device’s allocated stock. Reconnect to obtain additional stock or renew 24-hour access.</p>
      <div className="d-flex gap-2"><button type="button" className="primary-button" disabled={busy || !status.enabled || !status.connected} onClick={run}>{busy ? 'Synchronizing…' : 'Sync Now'}</button><button type="button" className="secondary-button" disabled={busy} onClick={refresh}>Refresh Status</button></div>
      {status.conflicts.map((conflict) => <div className="settings-section mt-4" key={conflict.operation_id}>
        <strong>{conflict.entity}</strong><p>{conflict.message}</p>
        <div className="d-flex gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={() => resolve(conflict.operation_id, 'keep_local')}>Retry My Changes</button><button type="button" className="secondary-button" disabled={busy} onClick={() => resolve(conflict.operation_id, 'accept_cloud')}>Use Cloud Version</button></div>
      </div>)}
    </div></section>}
  </div>;
}
