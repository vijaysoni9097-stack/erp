import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import '../styles/Login.css';

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (localStorage.getItem('access_token') === 'admin-session') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();

    if (username.trim() !== DEFAULT_USERNAME || password !== DEFAULT_PASSWORD) {
      setError('The username or password is incorrect.');
      return;
    }

    setError('');
    onLogin();
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
          <p className="login-subtitle">Enter your administrator credentials to continue.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <div className="login-input-wrap">
                <i className="fa-regular fa-user" aria-hidden="true" />
                <input
                  id="login-username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter your username"
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
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

            {error && <p className="login-error" role="alert">{error}</p>}

            <button type="submit" className="login-submit">
              Sign In <i className="fa-solid fa-arrow-right" />
            </button>
          </form>

          <p className="login-default-hint">Default login: <strong>admin</strong> / <strong>admin123</strong></p>
        </div>
      </section>
    </main>
  );
}

export default Login;