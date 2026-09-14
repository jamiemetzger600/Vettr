import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import SubmitDealPage from './pages/SubmitDealPage';
import BillingPage from './pages/BillingPage';
import SettingsPage from './pages/SettingsPage';
import DdPortalPage from './pages/DdPortalPage';
import UnderwritingPortalPage from './pages/UnderwritingPortalPage';
import UnderwritingHubPage from './pages/underwriting/UnderwritingHubPage';
import UnderwritingAppPage from './pages/underwriting/UnderwritingAppPage';
import TeamInviteAcceptPage from './pages/TeamInviteAcceptPage';
import AdminFeedbackPage from './pages/AdminFeedbackPage';
import FeedbackShell from './components/feedback/FeedbackShell';
import { userAPI } from './utils/api';
import { syncPushIfGranted } from './utils/webNotifications';

function NotificationClickBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      const data = event.data;
      if (!data || data.type !== 'VETTR_NOTIFICATION_CLICK') return;
      const raw = data.url || '/dashboard';
      try {
        const u = new URL(raw, window.location.origin);
        if (u.origin !== window.location.origin) {
          console.warn('[notifications] ignored off-origin click', raw);
          return;
        }
        const next = `${u.pathname}${u.search}`;
        console.log('[notifications] open', next);
        navigate(next);
      } catch (err) {
        console.warn('[notifications] bad url', raw, err);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

/** Full-screen splash shown while backend wakes from cold start (temporary — remove on paid plan). */
function WakeUpSplash() {
  return (
    <div className="wakeup-splash">
      <div className="wakeup-splash__spinner" />
      <p className="wakeup-splash__text">Loading Vettr&hellip;</p>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading, wakingUp } = useAuth();

  if (wakingUp) return <WakeUpSplash />;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px',
        color: 'var(--text-secondary, #a8a8a8)'
      }}>
        Loading...
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const settings = await userAPI.getSettings();
        if (cancelled) return;
        const enabled = Boolean(settings?.preferences?.browserNotifications);
        await syncPushIfGranted(userAPI, enabled);
      } catch (err) {
        console.warn('[App] push sync skipped', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <FeedbackShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/airtable" element={<DashboardPage feedSource="airtable" />} />
        <Route
          path="/billing"
          element={(
            <ProtectedRoute>
              <BillingPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/settings"
          element={(
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin/feedback"
          element={(
            <ProtectedRoute>
              <AdminFeedbackPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/teams/accept" element={<TeamInviteAcceptPage />} />
        <Route path="/dd/:token" element={<DdPortalPage />} />
        <Route path="/underwriting/:token" element={<UnderwritingPortalPage />} />
        <Route
          path="/app/underwriting"
          element={(
            <ProtectedRoute>
              <UnderwritingHubPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/app/underwriting/:dealId"
          element={(
            <ProtectedRoute>
              <UnderwritingAppPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/" element={<LandingPage />} />
        <Route path="/submit-deal" element={<SubmitDealPage />} />
      </Routes>
    </FeedbackShell>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TeamProvider>
          <NotificationClickBridge />
          <AppRoutes />
        </TeamProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
