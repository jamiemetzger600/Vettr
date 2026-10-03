function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SCOPE_COPY = {
  'vettr:read': 'Read buy boxes, deals, CRM, tasks, and due diligence.',
  'vettr:write': 'Add notes, tasks, follow-ups, and due diligence answers. Cannot delete, send email, or change a buy box.'
};

export function consentPage({ clientName, scopes, fields, csrf }) {
  const scopeItems = scopes
    .map((scope) => `<li><strong>${escapeHtml(scope)}</strong> — ${escapeHtml(SCOPE_COPY[scope] || scope)}</li>`)
    .join('');
  const hidden = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect ${escapeHtml(clientName)} to Vettr</title>
  <style>
    body { margin: 0; font-family: Georgia, "Iowan Old Style", serif; background: #1a1a1a; color: #e4e4e4; }
    main { max-width: 32rem; margin: 8vh auto; padding: 24px; background: #2a2a2a; border: 1px solid #3d3d3d; border-radius: 12px; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    p, li { color: #a8a8a8; line-height: 1.45; }
    ul { padding-left: 1.2rem; }
    .actions { display: flex; gap: 12px; margin-top: 20px; }
    button { font: inherit; border-radius: 8px; padding: 10px 16px; cursor: pointer; }
    .allow { background: #3d3d3d; color: #e4e4e4; border: 1px solid #c4c4c4; }
    .deny { background: transparent; color: #e4e4e4; border: 1px solid #3d3d3d; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(clientName)} wants to use your Vettr account</h1>
    <p>The chat stays in ${escapeHtml(clientName)}. Vettr does not read your email.</p>
    <ul>${scopeItems}</ul>
    <form method="post" action="/oauth/authorize">
      ${hidden}
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
      <div class="actions">
        <button class="allow" type="submit" name="decision" value="allow">Allow</button>
        <button class="deny" type="submit" name="decision" value="deny">Deny</button>
      </div>
    </form>
  </main>
</body>
</html>`;
}

export function oauthMessagePage(title, detail) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #1a1a1a; color: #e4e4e4; }
    main { max-width: 32rem; margin: 8vh auto; padding: 24px; background: #2a2a2a; border: 1px solid #3d3d3d; border-radius: 12px; }
    p { color: #a8a8a8; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></main></body>
</html>`;
}
