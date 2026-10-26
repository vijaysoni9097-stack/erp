import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authError, signIn } from '../services/api';
import '../styles/Login.css';


function Login({ onLogin }) {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      onLogin(await signIn(email, password));
    } catch (error) {
      setError(authError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="Preclinic pharmacy">
        <div className="showcase-topline">
          <span className="showcase-mark"><i className="fa-solid fa-plus" /></span>
          <span>PRECLINIC</span>
        </div>

        <div className="showcase-content">
          <p className="showcase-kicker">PHARMACY OPERATIONS</p>
          <h1>Care starts<br />with clarity.</h1>
          <p className="showcase-description">Your pharmacy workspace, ready for the day ahead.</p>
        </div>

        <div className="showcase-footer">
          <span><i className="fa-solid fa-shield-heart" /> Secure workspace</span>
          <span>© 2026 Preclinic</span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <span className="showcase-mark"><i className="fa-solid fa-plus" /></span>
            <span>PRECLINIC</span>
          </div>

          <p className="login-eyebrow">WELCOME BACK</p>
          <h2>Sign in to your account</h2>
          <p className="login-subtitle">Enter your pharmacist email and password to continue.</p>

          {location.state?.passwordChanged && <p role="status">Password updated. Sign in with your new password.</p>}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <div className="login-input-wrap">
                <i className="fa-regular fa-user" aria-hidden="true" />
                <input
                  id="login-email"
                  autoComplete="username"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <i className="fa-solid fa-lock" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  className="password-visibility"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <Link to="/forgot-password">Forgot password?</Link>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'} <i className="fa-solid fa-arrow-right" />
            </button>
          </form>

          <p className="login-default-hint">Sign in with your local pharmacy account. Internet is not required.</p>
        </div>
      </section>
    </main>
  );
}

export default Login;