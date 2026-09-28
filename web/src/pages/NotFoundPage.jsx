import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>Vettr</h1>
          <p>Page not found</p>
        </div>
        <div className="auth-form not-found-panel">
          <h2>404</h2>
          <p className="auth-form__lead">
            That path doesn&apos;t exist. Head back to the app or the landing page.
          </p>
          <p className="auth-footer">
            <Link to="/dashboard">Browse deals</Link>
            {' · '}
            <Link to="/">Home</Link>
            {' · '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
