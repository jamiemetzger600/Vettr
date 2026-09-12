import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { offMarketAPI, crmAPI } from '../utils/api';

export default function LlmIntegrationsPanel() {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [provider, setProvider] = useState('openai_compat');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [ingest, setIngest] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await offMarketAPI.getLlmConnection();
      setConnection(data);
      if (data?.provider) setProvider(data.provider);
      if (data?.model) setModel(data.model);
      if (data?.baseUrl) setBaseUrl(data.baseUrl);
    } catch (err) {
      console.error('[LlmIntegrations] load failed', err);
      setFlash({ type: 'error', text: err.message || 'Could not load AI connection' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFlash(null);
    try {
      const data = await offMarketAPI.saveLlmConnection({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined
      });
      setConnection(data);
      setApiKey('');
      setFlash({ type: 'success', text: 'AI / agent connection saved.' });
      console.log('[LlmIntegrations] saved', data.provider);
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFlash(null);
    try {
      const result = await offMarketAPI.testLlmConnection();
      setFlash({ type: 'success', text: result.ok ? 'Connection test succeeded.' : 'Test returned no JSON.' });
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleRotate = async () => {
    setFlash(null);
    try {
      const data = await offMarketAPI.rotateIngestToken();
      setIngest(data);
      setFlash({ type: 'success', text: 'Copy the ingest URL now — it is shown only once.' });
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Could not create ingest URL' });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Remove the stored LLM key from Vettr?')) return;
    try {
      await offMarketAPI.deleteLlmConnection();
      setConnection({ connected: false });
      setIngest(null);
      setFlash({ type: 'success', text: 'AI connection removed.' });
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Disconnect failed' });
    }
  };

  if (loading) {
    return <p className="settings-google-status">Checking AI / agent connection…</p>;
  }

  return (
    <div className="settings-google">
      {flash ? (
        <p className={flash.type === 'error' ? 'settings-message settings-message-error' : 'settings-message settings-message-success'} role="status">
          {flash.text}
        </p>
      ) : null}

      <p>
        Vettr does not host a model. Bring your own OpenAI-compatible key, Anthropic key, or an agent
        that POSTs prospects to your ingest URL.
      </p>

      <form onSubmit={handleSave} className="om-llm-form">
        <label className="om-field">
          <span>Provider</span>
          <select className="modal-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="openai_compat">OpenAI-compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="webhook">Agent ingest only</option>
          </select>
        </label>
        {provider !== 'webhook' ? (
          <>
            <label className="om-field">
              <span>API key {connection?.last4 ? `(saved …${connection.last4})` : ''}</span>
              <input
                className="modal-input"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={connection?.last4 ? 'Leave blank to keep saved key' : 'sk-…'}
              />
            </label>
            <label className="om-field">
              <span>Model</span>
              <input
                className="modal-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'}
              />
            </label>
            {provider === 'openai_compat' ? (
              <label className="om-field">
                <span>Base URL (optional)</span>
                <input
                  className="modal-input"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
            ) : null}
          </>
        ) : null}
        <div className="settings-action-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save connection'}
          </button>
          {provider !== 'webhook' ? (
            <button type="button" className="btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test'}
            </button>
          ) : null}
          {connection?.connected ? (
            <button type="button" className="btn-secondary" onClick={handleDisconnect}>
              Remove
            </button>
          ) : null}
        </div>
      </form>

      <h3 className="om-subhead">Agent ingest</h3>
      <p>
        Your bot can POST <code>{'{ campaignId, prospects: [{ company_name, owner_name, email }] }'}</code> to
        the ingest URL. Generate a new URL if you lose the last one.
      </p>
      <div className="settings-action-row">
        <button type="button" className="btn-secondary" onClick={handleRotate}>
          {connection?.hasIngestToken ? 'Rotate ingest URL' : 'Create ingest URL'}
        </button>
      </div>
      {ingest?.ingestUrl ? (
        <p className="settings-google-redirect">
          Ingest URL: <code>{ingest.ingestUrl}</code>
        </p>
      ) : null}

      <p className="om-muted">
        Gmail send and inbox tracking stay under{' '}
        <Link to="/settings">Google</Link>.{' '}
        <button
          type="button"
          className="header-link"
          onClick={async () => {
            try {
              const { url } = await crmAPI.startCalendarOAuth({ returnTo: 'settings', gmailReadonly: true });
              window.location.href = url;
            } catch (err) {
              setFlash({ type: 'error', text: err.message || 'Could not start Google sign-in' });
            }
          }}
        >
          Enable inbox tracking
        </button>
      </p>
    </div>
  );
}
