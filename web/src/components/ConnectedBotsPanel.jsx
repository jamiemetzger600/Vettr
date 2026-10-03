import { useCallback, useEffect, useState } from 'react';
import { mcpAPI } from '../utils/api';

export default function ConnectedBotsPanel() {
  const [config, setConfig] = useState(null);
  const [connections, setConnections] = useState({ clients: [], tokens: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextConfig, nextConnections] = await Promise.all([
        mcpAPI.getConfig(),
        mcpAPI.listConnections()
      ]);
      setConfig(nextConfig);
      setConnections(nextConnections);
    } catch (err) {
      console.error('[mcp] settings load failed', err);
      setError(err.message || 'Could not load connected bots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch (err) {
      console.warn('[mcp] clipboard failed', err);
      setMessage('Copy failed. Select the text and copy it manually.');
    }
  }

  async function createToken() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const created = await mcpAPI.createToken('Personal token');
      setNewToken(created.token);
      setMessage('Token created. Copy it now — Vettr will not show it again.');
      await load();
    } catch (err) {
      console.error('[mcp] create token failed', err);
      setError(err.message || 'Could not create a token');
    } finally {
      setBusy(false);
    }
  }

  async function revokeClient(clientId, name) {
    if (!window.confirm(`Disconnect ${name}? It will need to connect again.`)) return;
    setBusy(true);
    setError('');
    try {
      await mcpAPI.revokeClient(clientId);
      setMessage(`${name} disconnected.`);
      await load();
    } catch (err) {
      console.error('[mcp] revoke client failed', err);
      setError(err.message || 'Could not disconnect that bot');
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id, prefix) {
    if (!window.confirm(`Revoke token ${prefix}?`)) return;
    setBusy(true);
    setError('');
    try {
      await mcpAPI.revokeToken(id);
      setMessage('Token revoked.');
      if (newToken.startsWith(prefix)) setNewToken('');
      await load();
    } catch (err) {
      console.error('[mcp] revoke token failed', err);
      setError(err.message || 'Could not revoke that token');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !config) {
    return <p>Loading connected bots…</p>;
  }

  const clients = connections.clients || [];
  const tokens = connections.tokens || [];

  return (
    <div>
      <p>
        Connect Claude, ChatGPT, or Grok to this account. The chat stays in the bot.
        It can read your buy box, deals, CRM, and due diligence, and it can add notes,
        tasks, follow-ups, and answers. It cannot delete, send email, or change a buy box.
        Email stays in the bot.
      </p>
      {error ? <p className="settings-message settings-message-error" role="alert">{error}</p> : null}
      {message ? <p className="settings-message settings-message-success" role="status">{message}</p> : null}

      <p>
        <strong>MCP URL</strong>
      </p>
      <p className="mcp-url">{config?.mcpUrl || 'Unavailable'}</p>
      <div className="settings-action-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          className="btn-secondary"
          disabled={!config?.mcpUrl}
          onClick={() => copyText(config.mcpUrl, 'MCP URL')}
        >
          Copy MCP URL
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!config?.skill}
          onClick={() => copyText(config.skill, 'Skill')}
        >
          Copy deal-desk skill
        </button>
      </div>
      <p>
        In the bot, add a custom connector with that URL and sign in when asked.
        Paste the skill into Claude if you want a scheduled deal-desk check.
        A bot that only accepts a header can use a personal token as <span className="mcp-url">Authorization: Bearer …</span>.
      </p>

      <h3>Connected bots</h3>
      {clients.length === 0 ? (
        <p>No bots are connected yet. The list fills in after a bot finishes sign-in.</p>
      ) : (
        <ul className="mcp-connection-list">
          {clients.map((client) => (
            <li key={client.client_id}>
              <span>
                <strong>{client.client_name}</strong>
                <span className="mcp-meta"> {client.scopes}</span>
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => revokeClient(client.client_id, client.client_name)}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Personal tokens</h3>
      {newToken ? (
        <div className="mcp-token-once">
          <p>Copy this token now. It is shown once.</p>
          <code>{newToken}</code>
          <button type="button" className="btn-secondary" onClick={() => copyText(newToken, 'Token')}>
            Copy token
          </button>
        </div>
      ) : null}
      {tokens.length === 0 ? <p>No personal tokens.</p> : (
        <ul className="mcp-connection-list">
          {tokens.map((token) => (
            <li key={token.id}>
              <span>
                <strong>{token.name}</strong>
                <span className="mcp-meta"> {token.token_prefix}… · {token.scopes}</span>
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => revokeToken(token.id, token.token_prefix)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-primary" disabled={busy} onClick={createToken}>
        {busy ? 'Working…' : 'Create personal token'}
      </button>
    </div>
  );
}
