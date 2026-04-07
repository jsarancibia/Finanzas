/**
 * POST JSON { "session_id": "uuid" } — oculta mensajes del chat (no toca finanzas).
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { handleChatClearPost } = await import('../dist/routes/handleChatClearPost.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const sessionId =
      typeof body.session_id === 'string'
        ? body.session_id.trim()
        : typeof body.sessionId === 'string'
          ? body.sessionId.trim()
          : null;
    const out = await handleChatClearPost(sessionId);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: msg });
  }
}
