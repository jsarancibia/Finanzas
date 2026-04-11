/**
 * POST /api/crear-cuenta
 * Crea un banco (upsert) + cuenta nueva para el usuario.
 * Body: { banco: string, nombre: string, tipo: 'disponible' | 'ahorro' }
 * arquitectura13 — Flujo "Crear cuenta".
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
    const { handleCrearCuentaPost } = await import('../dist/routes/handleCrearCuentaPost.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

    const banco = typeof body.banco === 'string' ? body.banco.trim() : '';
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const tipo = body.tipo === 'ahorro' ? 'ahorro' : 'disponible';

    if (!banco || !nombre) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ ok: false, error: 'Falta banco o nombre' });
    }

    const out = await handleCrearCuentaPost(banco, nombre, tipo, user.id);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(out.ok ? 200 : 422).json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ ok: false, error: msg });
  }
}
