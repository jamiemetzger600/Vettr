import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function SubmitDealPage() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState({
    name: '',
    askingPrice: '',
    ebitda: '',
    city: '',
    state: '',
    industry: '',
    listingUrl: '',
    brokerEmail: '',
    notes: ''
  });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const { dealsAPI } = await import('../utils/api');
      const res = await dealsAPI.submitOffMarket(form);
      console.log('[SubmitDeal] saved', res);
      setStatus({ ok: true, text: 'Deal submitted. It will show in the off-market source after review.' });
      setForm({
        name: '', askingPrice: '', ebitda: '', city: '', state: '',
        industry: '', listingUrl: '', brokerEmail: '', notes: ''
      });
    } catch (err) {
      console.error('[SubmitDeal] failed', err);
      setStatus({ ok: false, text: err.message || 'Submit failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <p className="landing-kicker">Brokers</p>
        <h1>Submit a deal</h1>
        <p className="landing-lead">
          Off-market listings for Vettr buyers. No public marketplace scrape — you send the deal.
        </p>
      </header>
      <form className="landing-section" onSubmit={handleSubmit}>
        {!user ? (
          <p className="crm-muted">
            <Link to="/register">Sign up</Link> or <Link to="/login">sign in</Link> to submit.
          </p>
        ) : null}
        <div className="form-group">
          <label htmlFor="name">Business name</label>
          <input id="name" name="name" className="modal-input" value={form.name} onChange={onChange} required />
        </div>
        <div className="form-group">
          <label htmlFor="askingPrice">Asking price</label>
          <input id="askingPrice" name="askingPrice" className="modal-input" value={form.askingPrice} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="ebitda">Cash flow / EBITDA</label>
          <input id="ebitda" name="ebitda" className="modal-input" value={form.ebitda} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="city">City</label>
          <input id="city" name="city" className="modal-input" value={form.city} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="state">State</label>
          <input id="state" name="state" className="modal-input" value={form.state} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="industry">Industry</label>
          <input id="industry" name="industry" className="modal-input" value={form.industry} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="listingUrl">Listing or CIM URL (optional)</label>
          <input id="listingUrl" name="listingUrl" className="modal-input" value={form.listingUrl} onChange={onChange} />
        </div>
        <div className="form-group">
          <label htmlFor="brokerEmail">Your email</label>
          <input id="brokerEmail" name="brokerEmail" type="email" className="modal-input" value={form.brokerEmail} onChange={onChange} required />
        </div>
        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="modal-input" rows={3} value={form.notes} onChange={onChange} />
        </div>
        {status ? (
          <p className={status.ok ? 'ioi-success' : 'ioi-warn'}>{status.text}</p>
        ) : null}
        <button type="submit" className="btn-primary" disabled={saving || !user}>
          {saving ? 'Submitting…' : 'Submit deal'}
        </button>
      </form>
    </div>
  );
}
