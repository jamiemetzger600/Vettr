import { Link } from 'react-router-dom';

/**
 * Shared chrome for Terms / Privacy legal pages (dark Vettr product theme).
 */
export default function LegalDocLayout({ title, children }) {
  return (
    <div className="legal-page">
      <header className="legal-page__header">
        <Link to="/" className="legal-page__brand">Vettr</Link>
        <nav className="legal-page__nav" aria-label="Legal">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>
      <article className="legal-doc">
        <h1>{title}</h1>
        {children}
      </article>
      <footer className="legal-page__footer">
        <Link to="/">Home</Link>
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  );
}
