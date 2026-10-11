import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearSession, AUTH_EXPIRED_EVENT } from '../services/api';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function cancel() {
    setValues({ current_password: '', new_password: '', confirm_password: '' });
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!values.current_password) return setError('Enter your current password.');
    if (values.new_password.length < 12 || values.new_password.length > 128) {
      return setError('Your new password must contain 12–128 characters.');
    }
    if (values.new_password !== values.confirm_password) return setError('New password and confirmation must match.');
    setSaving(true);
    try {
      await api.post('/settings/password', values);
      clearSession();
      navigate('/login', { replace: true, state: { passwordChanged: true } });
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : err.response?.status === 422
        ? 'Check your current password and use matching new passwords of 12–128 characters.'
        : 'Unable to update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} noValidate>
    <h2>Change Password</h2>
    <p className="inline-note">Use 12–128 characters. After updating, sign in again with your new password.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="settings-section settings-row">
      {[
        ['current_password', 'Current Password', 'current-password'],
        ['new_password', 'New Password', 'new-password'],
        ['confirm_password', 'Confirm Password', 'new-password'],
      ].map(([key, label, autoComplete]) => <div className="field-group" key={key}>
        <label htmlFor={key}>{label}</label>
        <input id={key} type="password" autoComplete={autoComplete} required maxLength={128}
          disabled={saving} value={values[key]}
          onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
      </div>)}
    </div>
    <div className="form-actions">
      <button type="button" className="secondary-button" disabled={saving} onClick={cancel}>Cancel</button>
      <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Updating…' : 'Update Password'}</button>
    </div>
  </form>;
}
