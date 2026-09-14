import { useState, useEffect } from 'react';
import { userAPI, paymentsAPI } from '../utils/api';
import Navigation from '../components/Navigation';
import { useAuth } from '../context/AuthContext';

export default function BillingPage() {
  const { user, logout } = useAuth();
  const [entitlements, setEntitlements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    loadEntitlements();
  }, []);

  const loadEntitlements = async () => {
    try {
      const data = await userAPI.getEntitlements();
      setEntitlements(data);
    } catch (error) {
      console.error('Failed to load entitlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plan) => {
    setUpgrading(true);
    try {
      const { url } = await paymentsAPI.createCheckoutSession(plan);
      window.location.href = url;
    } catch (error) {
      alert('Failed to start checkout: ' + error.message);
      setUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { url } = await paymentsAPI.createPortalSession();
      window.location.href = url;
    } catch (error) {
      alert('Failed to open billing portal: ' + error.message);
    }
  };

  if (loading) return <div className="loading-screen">Loading billing...</div>;

  return (
    <div className="app-page-shell">
      <Navigation
        user={user}
        logout={logout}
        showTabs={false}
        pageTitle="Vettr"
        pageSubtitle="Subscription and billing"
      />
      
      <div className="billing-page dashboard-content">
        <h1>Billing & Subscription</h1>

        <div className="current-plan">
          <h2>Current Plan: {entitlements?.plan || 'Free'}</h2>
          <p>Status: {entitlements?.status || 'none'}</p>
        </div>

        {entitlements?.plan === 'free' || entitlements?.status !== 'active' ? (
          <div className="pricing-plans">
            <div className="plan-card featured">
              <h3>Vettr Pro</h3>
              <p className="billing-beta-note">
                Free accounts already include CRM, calculator, IOI, underwriting, and a daily
                buy-box match email. Pro is for instant alerts.
              </p>
              <p className="price">$19.99<span>/month</span></p>
              <ul>
                <li>Instant match alerts (email + push)</li>
                <li>Same CRM, IOI, and calculator as Free</li>
                <li>Daily digest still included</li>
              </ul>
              <button onClick={() => handleUpgrade('monthly')} className="btn-primary" disabled={upgrading}>
                {upgrading ? 'Loading...' : 'Subscribe — $19.99/month'}
              </button>
            </div>
          </div>
        ) : (
          <div className="manage-subscription">
            <p>Manage your subscription, update payment method, or cancel:</p>
            <button onClick={handleManageSubscription} className="btn-primary">
              Manage Subscription
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
