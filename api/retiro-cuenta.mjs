/**
 * POST /api/retiro-cuenta
 * Retiro directo desde una cuenta de ahorro/inversión.
 * Body: { monto: number, banco: string, cuentaProducto: string }
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
    const { handleRetiroCuentaPost } = await import('../dist/routes/handleRetiroCuentaPost.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const banco = typeof body.banco === 'string' ? body.banco.trim() : '';
    const cuentaProducto = typeof body.cuentaProducto === 'string' ? body.cuentaProducto.trim() : '';

    if (!banco || !cuentaProducto) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'Falta banco o cuentaProducto' });
    }

    const out = await handleRetiroCuentaPost(monto, banco, cuentaProducto, user.id);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(out.ok ? 200 : 422).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: msg });
  }
}
