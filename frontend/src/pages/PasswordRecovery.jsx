import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, clearSession, AUTH_EXPIRED_EVENT } from '../services/api';
import '../styles/Login.css';

export default function PasswordRecovery({ reset = false }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const validToken = token.length >= 32 && token.length <= 128;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (reset && password !== confirmation) {
      setError('Passwords must match.');
      return;
    }
    setBusy(true);
    try {
      if (reset) {
        await api.post('/auth/reset-password', { token, new_password: password, confirm_password: confirmation });
        clearSession();
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
        setPassword('');
        setConfirmation('');
        // Remove the consumed secret from the address bar and current history entry.
        window.history.replaceState(window.history.state, '', window.location.pathname);
      } else {
        await api.post('/auth/forgot-password', { email: email.trim() });
      }
      setDone(true);
    } catch (err) {
      const status = err.response?.status;
      if (reset && status === 400) {
        setInvalid(true);
        setError('This reset link is invalid, expired, or already used. Request a new link.');
      } else if (status === 503) {
        setError('Password recovery is unavailable. Contact your administrator to check email delivery configuration.');
      } else if (status === 429) {
        setError('Too many requests. Please wait a minute and try again.');
      } else if (status === 422) {
        setError(reset ? 'Use matching passwords of 12–128 characters and a valid reset link.' : 'Enter a valid email address.');
      } else {
        setError('Unable to reach the service. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page recovery-page">
    <section className="login-form-side">
      <div className="login-form-wrap">
        <p className="login-eyebrow">ACCOUNT RECOVERY</p>
        <h1>{reset ? 'Reset your password' : 'Forgot your password?'}</h1>
        {done ? <div role="status">
          <p>{reset ? 'Your password has been reset. Sign in with your new password.' : 'If an account matches that email, a password reset link will be sent. Check your inbox and spam folder. The link expires after 15 minutes.'}</p>
          {!reset && <button className="secondary-button" type="button" onClick={() => setDone(false)}>Request another link</button>}
        </div> : <>
          <p className="login-subtitle">{reset ? 'Choose a new password of 12–128 characters.' : 'Enter your account email to request a reset link.'}</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          {reset && (!validToken || invalid) ? <>
            {!validToken && <p role="alert">This reset link is missing or invalid.</p>}
            <Link to="/forgot-password">Request a new reset link</Link>
          </> : <form className="login-form" onSubmit={submit}>
            {reset ? <>
              <div className="login-field"><label htmlFor="reset-password">New password</label><div className="login-input-wrap"><input id="reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></div></div>
              <div className="login-field"><label htmlFor="reset-confirmation">Confirm new password</label><div className="login-input-wrap"><input id="reset-confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div></div>
            </> : <div className="login-field"><label htmlFor="recovery-email">Email</label><div className="login-input-wrap"><input id="recovery-email" type="email" autoComplete="email" maxLength={150} required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>}
            <button className="login-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : reset ? 'Reset Password' : 'Send Reset Link'}</button>
          </form>}
        </>}
        <p className="login-default-hint"><Link to="/login">Back to sign in</Link></p>
      </div>
    </section>
  </main>;
}
