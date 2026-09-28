import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { isValidEmail, INVALID_EMAIL_MESSAGE } from '../utils/emailValidation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { wakingUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValidEmail(email)) {
      setError(INVALID_EMAIL_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
      console.log('[ForgotPassword] request sent');
    } catch (err) {
      setError(err.message || 'Could not send reset email');
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
          <h2>Reset password</h2>
          {sent ? (
            <>
              <p className="auth-form__lead">
                If that email is registered, we sent a reset link. Check your inbox (and spam).
              </p>
              <p className="auth-footer"><Link to="/login">Back to sign in</Link></p>
            </>
          ) : (
            <>
              <p className="auth-form__lead">Enter your account email and we will send a reset link.</p>
              {error && <div className="error-message">{error}</div>}
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="auth-footer"><Link to="/login">Back to sign in</Link></p>
              <p className="auth-footer">
                <Link to="/terms">Terms</Link>
                {' · '}
                <Link to="/privacy">Privacy</Link>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
