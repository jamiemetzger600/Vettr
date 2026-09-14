import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();
  const appPath = user ? '/dashboard' : '/dashboard';

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <p className="landing-kicker">Vettr</p>
        <h1>Find it. Vett it. Save it.</h1>
        <p className="landing-lead">
          For SMB acquisition buyers who are drowning in BizBuySell tabs and spreadsheets.
          Set a buy box. See only matching listings. Run the calculator. Send an IOI. Track the deal.
        </p>
        <div className="landing-cta">
          <Link to={appPath} className="btn-primary">Browse deals</Link>
          {user ? (
            <Link to="/dashboard?tab=crm" className="btn-secondary">Open CRM</Link>
          ) : (
            <Link to="/register" className="btn-secondary">Sign up free</Link>
          )}
        </div>
      </header>

      <section className="landing-section">
        <h2>Who it&apos;s for</h2>
        <p>
          Independent buyers and searchers who already know their criteria — price, EBITDA, industry,
          geography — and need one feed that respects that box instead of 400 listings that don&apos;t.
        </p>
      </section>

      <section className="landing-section">
        <h2>The loop</h2>
        <ol className="landing-loop">
          <li><strong>Save</strong> a listing that matches your buy box</li>
          <li><strong>Calculator</strong> — CoC, DSCR, payback on your terms</li>
          <li><strong>IOI</strong> — send from Gmail with your company and signature</li>
          <li><strong>Pipeline</strong> — stage changes stick on the board (including LOI Sent)</li>
        </ol>
      </section>

      <section className="landing-section">
        <h2>Pricing</h2>
        <div className="landing-pricing">
          <article className="landing-plan">
            <h3>Free</h3>
            <p className="landing-price">$0</p>
            <ul>
              <li>Browse the market and set a buy box</li>
              <li>Calculator on every listing</li>
              <li>CRM, IOI, underwriting after signup</li>
              <li>Daily &ldquo;N new matches overnight&rdquo; email</li>
            </ul>
          </article>
          <article className="landing-plan landing-plan--pro">
            <h3>Pro</h3>
            <p className="landing-price">$19.99<span>/mo</span></p>
            <ul>
              <li>Everything in Free</li>
              <li>Instant match alerts</li>
            </ul>
            <Link to={user ? '/billing' : '/register'} className="btn-primary">
              {user ? 'Manage billing' : 'Start free'}
            </Link>
          </article>
        </div>
      </section>

      <section className="landing-section">
        <h2>Vs Sheets + BizBuySell</h2>
        <p>
          Spreadsheets go stale. Marketplace sites are noise. Vettr loads only deals that match your
          buy box, keeps pipeline stage in one CRM, and emails you when new matches show up overnight —
          instead of you refreshing five sites every morning.
        </p>
      </section>

      <footer className="landing-footer">
        {user ? (
          <Link to="/dashboard">Go to dashboard</Link>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Create a free account</Link>
          </>
        )}
        <Link to="/submit-deal">Brokers: submit a deal</Link>
      </footer>
    </div>
  );
}
