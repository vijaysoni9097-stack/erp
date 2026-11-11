import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './src/index.css';
import './src/styles/Login.css';

function Setup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirm_password) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/desktop/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      if (!response.ok) {
        const { detail } = await response.json();
        throw new Error(typeof detail === 'string' ? detail : 'Check the account details and password.');
      }
      window.location.replace('/login');
    } catch (failure) { setError(failure.message || 'Setup could not be completed. Please retry.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page" style={{ fontFamily: 'var(--sans)' }}>
    <section className="login-showcase" aria-label="Preclinic pharmacy">
      <div className="showcase-topline"><span className="showcase-mark"><i className="fa-solid fa-plus" /></span><span>PRECLINIC</span></div>
      <div className="showcase-content"><p className="showcase-kicker">PHARMACY OPERATIONS</p><h1>Care starts<br />with clarity.</h1><p className="showcase-description">Your pharmacy workspace, ready for the day ahead.</p></div>
      <div className="showcase-footer"><span><i className="fa-solid fa-shield-heart" /> Secure workspace</span><span>© 2026 Preclinic</span></div>
    </section>
    <section className="login-form-side"><div className="login-form-wrap">
      <p className="login-eyebrow">DESKTOP SETUP</p><h2>Create your local account</h2>
      <p className="login-subtitle">Set up the first superadmin for this computer. Your existing pharmacy workspace opens after setup.</p>
      <form className="login-form" onSubmit={submit}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}>
          {[
            ['first_name', 'First name', 'text', 100], ['last_name', 'Last name', 'text', 100],
            ['email', 'Email', 'email', 150], ['pharmacy_name', 'Pharmacy name', 'text', 150],
            ['license_number', 'License number', 'text', 100], ['password', 'Password (12–128 characters)', 'password', 128],
            ['confirm_password', 'Confirm password', 'password', 128],
          ].map(([name, label, type, max]) => <div className="login-field" key={name}>
            <label htmlFor={`setup-${name}`}>{label}</label><div className="login-input-wrap"><input id={`setup-${name}`} name={name} type={type} required maxLength={max} minLength={type === 'password' ? 12 : 1} autoComplete={type === 'password' ? 'new-password' : name === 'email' ? 'username' : undefined} /></div>
          </div>)}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="login-submit">{busy ? 'Creating account…' : 'Create Account'}</button>
        </fieldset>
      </form>
    </div></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<Setup />);
