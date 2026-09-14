import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { mergeGuestSettingsIntoAccount } from '../utils/mergeGuestSettings';
import { parseAuthReturnParams } from '../hooks/useGuestAccess';
import { getSignupCopy } from '../utils/guestEntitlements';
import { logGuestEvent } from '../utils/guestAnalytics';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, wakingUp, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const signupCopy = location.state?.signupCopy || getSignupCopy(searchParams.get('reason') || 'default');

  const postAuthPath = useMemo(() => {
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
  }, [searchParams]);

  useEffect(() => {
    if (user) navigate(postAuthPath, { replace: true });
  }, [user, navigate, postAuthPath]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await register(email, password);
      logGuestEvent('guest_register_complete');
      await mergeGuestSettingsIntoAccount();
      navigate(postAuthPath);
    } catch (err) {
      const msg = err.message || 'Registration failed';
      setError(msg.includes('fetch') || msg === 'Request failed' || msg === 'Failed to fetch'
        ? 'Unable to reach the server. If this persists, the app may be misconfigured (missing API URL).'
        : msg);
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

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>Vettr</h1>
          <p>Find it. Vett it. Save it.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>{signupCopy.title}</h2>
          <p className="auth-form__lead">{signupCopy.body}</p>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters" />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Re-enter password" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Creating account...' : 'Sign Up'}</button>
          <p className="auth-footer">Already have an account? <Link to={`/login${location.search}`}>Sign in</Link></p>
          <p className="auth-footer"><Link to="/dashboard">Browse without signing in</Link>
            {' · '}
            <Link to="/">What is Vettr?</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
