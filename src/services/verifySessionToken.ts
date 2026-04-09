import { supabase } from './supabaseClient.js';

export type AuthUserInfo = { id: string; email: string | null };

export type VerifyResult =
  | { ok: true; user: AuthUserInfo }
  | { ok: false; status: number; message: string };

/**
 * Valida el JWT de Supabase Auth (header Authorization: Bearer …).
 * Si existe `ALLOWED_AUTH_EMAIL`, solo ese correo (minúsculas) puede acceder.
 */
export async function verifyBearerToken(
  authorizationHeader: string | undefined | null,
): Promise<VerifyResult> {
  if (!authorizationHeader || !authorizationHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, message: 'Se requiere sesión. Inicia sesión.' };
  }
  const token = authorizationHeader.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, message: 'Token ausente.' };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, message: 'Sesión no válida o expirada.' };
  }

  const allowed = process.env.ALLOWED_AUTH_EMAIL?.trim().toLowerCase();
  if (allowed) {
    const em = (data.user.email ?? '').trim().toLowerCase();
    if (em !== allowed) {
      return { ok: false, status: 403, message: 'Correo no autorizado.' };
    }
  }

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
  };
}
