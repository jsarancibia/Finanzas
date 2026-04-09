/**
 * Vercel Serverless: POST JSON { "message": "..." }.
 * Requiere `npm run build` para generar `dist/` antes del deploy.
 */
import { requireAuth } from '../lib/authGuard.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) {
    return;
  }

  try {
    const { handleChatPost } = await import('../dist/routes/handleChatPost.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const message = body.message;
    if (typeof message !== 'string' || !message.trim()) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'Falta "message" (string)' });
    }

    const sessionId =
      typeof body.sessionId === 'string' || typeof body.session_id === 'string'
        ? String(body.sessionId ?? body.session_id).trim()
        : null;

    const out = await handleChatPost(message.trim(), {
      sessionId,
      authUserId: user.id,
      authUserEmail: user.email ?? null,
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: msg });
  }
}
