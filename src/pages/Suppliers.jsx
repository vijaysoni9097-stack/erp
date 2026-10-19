import { useEffect, useState } from 'react';
import { api } from '../services/api';
import '../styles/Suppliers.css';
import '../styles/Settings.css';

const empty = { name: '', contact_person: '', phone: '', email: '', address: '' };
const fields = [['name', 'Supplier Name', 150], ['contact_person', 'Contact Person', 100], ['phone', 'Phone', 30], ['email', 'Email', 150], ['address', 'Address', 1000]];
function message(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((item) => item.msg).join(' ') : 'Unable to reach the local service. Please retry.';
}
export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/suppliers').then(({ data }) => { if (active) setSuppliers(data); })
      .catch((err) => { if (active) setError(message(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  function edit(supplier) {
    setEditing(supplier?.id || 'new');
    setDraft(supplier ? Object.fromEntries(fields.map(([key]) => [key, supplier[key] || ''])) : empty);
    setError(''); setNotice('');
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = editing === 'new' ? await api.post('/suppliers', draft) : await api.put(`/suppliers/${editing}`, draft);
      setSuppliers((current) => [...current.filter((item) => item.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null); setDraft(empty); setNotice('Supplier saved on this computer.'); window.dispatchEvent(new Event('erp:suppliers-updated'));
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function remove(supplier) {
    if (!window.confirm(`Delete supplier ${supplier.name}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await api.delete(`/suppliers/${supplier.id}`); setSuppliers((current) => current.filter((item) => item.id !== supplier.id)); setNotice('Supplier deleted.'); window.dispatchEvent(new Event('erp:suppliers-updated')); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  return <div className="suppliers-page">
    <header className="suppliers-header"><div><p className="eyebrow">Inventory</p><h1>Suppliers</h1></div><button type="button" className="primary-btn" disabled={busy} onClick={() => edit(null)}><i className="fa-solid fa-plus" /> Add Supplier</button></header>
    {error && <p role="alert" className="login-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {editing && <section className="suppliers-panel mb-4"><form onSubmit={save} className="p-3">
      <h2>{editing === 'new' ? 'Add Supplier' : 'Edit Supplier'}</h2>
      <div className="settings-row">{fields.map(([key, label, maxLength]) => <div className="field-group" key={key}><label htmlFor={`supplier-${key}`}>{label}</label><input id={`supplier-${key}`} type={key === 'email' ? 'email' : 'text'} maxLength={maxLength} minLength={key === 'name' ? 2 : undefined} required={key === 'name'} disabled={busy} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></div>)}</div>
      <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save Supplier'}</button></div>
    </form></section>}
    <section className="suppliers-panel"><div className="panel-head"><h2>Suppliers ({suppliers.length})</h2><button type="button" className="ghost-btn" disabled={loading || busy} onClick={() => { setError(''); setRetry((value) => value + 1); }}>Refresh</button></div>
      {loading ? <p role="status" className="p-3">Loading suppliers…</p> : <div className="table-wrap"><table className="suppliers-table"><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead><tbody>
        {suppliers.map((supplier) => <tr key={supplier.id}><td>{supplier.name}</td><td>{supplier.contact_person || '—'}</td><td>{supplier.phone || '—'}</td><td>{supplier.email || '—'}</td><td><div className="d-flex gap-2"><button type="button" className="table-action" disabled={busy} onClick={() => edit(supplier)}>Edit</button><button type="button" className="table-action" disabled={busy} onClick={() => remove(supplier)}>Delete</button></div></td></tr>)}
        {!suppliers.length && <tr><td colSpan={5}>No suppliers yet. Add your first supplier to begin.</td></tr>}
      </tbody></table></div>}
    </section>
  </div>;
}
