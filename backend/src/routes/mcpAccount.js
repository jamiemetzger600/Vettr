import express from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUPPORTED_SCOPES, normalizeScopes } from '../lib/mcpOauth.js';
import { mcpResourceUrl } from '../lib/mcpPublicUrl.js';
import {
  createPersonalToken,
  listConnections,
  revokeClient,
  revokePersonalToken
} from '../services/mcpTokenService.js';

const router = express.Router();
const skillPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../bot-skills/vettr/SKILL.md'
);

export function readVettrSkill() {
  return readFileSync(skillPath, 'utf8');
}

router.get('/config', (req, res) => {
  let skill = '';
  try {
    skill = readVettrSkill();
  } catch (err) {
    console.warn('[mcp] skill file missing', err.message);
  }
  res.json({
    mcpUrl: mcpResourceUrl(req),
    scopes: SUPPORTED_SCOPES,
    skill
  });
});

router.get('/connections', async (req, res) => {
  try {
    const data = await listConnections(req.user.userId);
    res.json(data);
  } catch (err) {
    console.error('[mcp] list connections failed', err);
    res.status(500).json({ error: 'Could not load connected bots' });
  }
});

router.delete('/connections/:clientId', async (req, res) => {
  try {
    const count = await revokeClient(req.user.userId, req.params.clientId);
    res.json({ revoked: count > 0 });
  } catch (err) {
    console.error('[mcp] revoke client failed', err);
    res.status(500).json({ error: 'Could not revoke that bot' });
  }
});

router.post('/tokens', async (req, res) => {
  try {
    const name = String(req.body?.name || 'Personal token').trim().slice(0, 80) || 'Personal token';
    const scopes = normalizeScopes(req.body?.scopes || SUPPORTED_SCOPES.join(' '));
    if (!scopes.length) return res.status(400).json({ error: 'Pick at least one scope' });
    const created = await createPersonalToken(req.user.userId, name, scopes.join(' '));
    res.status(201).json({
      id: created.id,
      token: created.token,
      tokenPrefix: created.token_prefix,
      name: created.name,
      scopes: created.scopes,
      createdAt: created.created_at
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mcp] create token failed', err);
    res.status(500).json({ error: 'Could not create a token' });
  }
});

router.delete('/tokens/:id', async (req, res) => {
  try {
    const count = await revokePersonalToken(req.user.userId, Number(req.params.id));
    res.json({ revoked: count > 0 });
  } catch (err) {
    console.error('[mcp] revoke token failed', err);
    res.status(500).json({ error: 'Could not revoke that token' });
  }
});

export default router;
