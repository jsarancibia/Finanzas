/**
 * POST /api/eliminar-cuenta
 * Body: { banco: string, cuentaProducto: string }
 * Elimina la fila en `cuentas` si no hay movimientos con esa cuenta_id.
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
  if (!user) return;

  try {
    const { handleEliminarCuentaPost } = await import('../dist/routes/handleEliminarCuentaPost.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

    const banco = typeof body.banco === 'string' ? body.banco.trim() : '';
    const cuentaProducto = typeof body.cuentaProducto === 'string' ? body.cuentaProducto.trim() : '';

    if (!banco || !cuentaProducto) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ ok: false, texto: 'Falta banco o cuentaProducto' });
    }

    const out = await handleEliminarCuentaPost(banco, cuentaProducto, user.id);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(out.ok ? 200 : 422).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ ok: false, texto: msg });
  }
}
