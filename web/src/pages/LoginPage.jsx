import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { mergeGuestSettingsIntoAccount } from '../utils/mergeGuestSettings';
import { parseAuthReturnParams } from '../hooks/useGuestAccess';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, wakingUp, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const fromExtension = searchParams.get('from') === 'extension';
  const resetOk = Boolean(location.state?.resetOk);

  const postAuthPath = useMemo(() => {
    // From Chrome extension: stay on a simple confirmation path (no auto-redirect away)
    if (fromExtension) return null;
    const { returnTo, dealDbId } = parseAuthReturnParams(searchParams.toString());
    if (returnTo && returnTo.includes('?')) {
      if (!dealDbId) return returnTo;
      const u = new URL(returnTo, 'http://vettr.local');
      u.searchParams.set('dealDbId', dealDbId);
      return `${u.pathname}?${u.searchParams.toString()}`;
    }
    const p = new URLSearchParams();
    if (dealDbId) p.set('dealDbId', dealDbId);
    const qs = p.toString();
    return `${returnTo || '/dashboard'}${qs ? `?${qs}` : ''}`;
  }, [searchParams, fromExtension]);

  useEffect(() => {
    if (user && postAuthPath) navigate(postAuthPath, { replace: true });
  }, [user, navigate, postAuthPath]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      await mergeGuestSettingsIntoAccount();
      if (fromExtension) {
        // Stay on this page so the success banner is visible
        return;
      }
      navigate(postAuthPath || '/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (wakingUp) {
    return (
      <div className="wakeup-splash">
        <div className="wakeup-splash__spinner" />
        <p className="wakeup-splash__text">Loading Vettr&hellip;</p>
      </div>
    );
  }

  // After extension-driven login: show success only when session exists
  if (fromExtension && user) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-header">
            <h1>Vettr</h1>
            <p>Find it. Vett it. Save it.</p>
          </div>
          <p className="auth-banner" role="status">
            Signed in as {user.email}. You can close this tab and return to the Chrome extension —
            My Deals will sync automatically.
          </p>
          <p className="auth-footer">
            <Link to="/dashboard">Open Vettr dashboard</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>Vettr</h1>
          <p>Find it. Vett it. Save it.</p>
        </div>
        {fromExtension && (
          <p className="auth-banner">Sign in with your Vettr account to sync My Deals with the Chrome extension.</p>
        )}
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>Sign In</h2>
          {resetOk && !error ? (
            <p className="auth-form__lead">Password updated. Sign in with your new password.</p>
          ) : null}
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          <p className="auth-footer">
            <Link to={`/forgot-password${location.search}`}>Forgot password?</Link>
          </p>
          <p className="auth-footer">
            Don&apos;t have an account? <Link to={`/register${location.search}`}>Sign up</Link>
          </p>
          <p className="auth-footer">
            <Link to="/dashboard">Browse without signing in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
