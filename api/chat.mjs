/**
 * Vercel Serverless: POST JSON { "message": "..." }.
 * Requiere `npm run build` para generar `dist/` antes del deploy.
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
    const { handleChatPost } = await import('../dist/routes/handleChatPost.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const message = body.message;
    if (typeof message !== 'string' || !message.trim()) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'Falta "message" (string)' });
    }

    const out = await handleChatPost(message.trim());
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: msg });
  }
}
