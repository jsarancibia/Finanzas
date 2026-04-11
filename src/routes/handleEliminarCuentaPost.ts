import 'dotenv/config';

import { withContextoUsuario } from '../services/memoriaContexto.js';
import { getSupabaseService } from '../services/supabaseClient.js';

export type EliminarCuentaResponse = {
  ok: boolean;
  /** Mensaje para mostrar en la UI (éxito o error). */
  texto: string;
};

function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elimina una cuenta del usuario si no tiene movimientos vinculados (`cuenta_id`).
 * No ajusta `balances`: solo debe usarse con saldo coherente o cuentas creadas por error sin movimientos.
 */
export async function handleEliminarCuentaPost(
  banco: string,
  cuentaProducto: string,
  authUserId: string,
): Promise<EliminarCuentaResponse> {
  return withContextoUsuario(authUserId.trim(), async () => {
    const uid = authUserId.trim();
    if (!uid) {
      return { ok: false, texto: 'No autorizado.' };
    }

    const bancoTrim = banco?.trim() ?? '';
    const cuentaTrim = cuentaProducto?.trim() ?? '';
    if (!bancoTrim || !cuentaTrim) {
      return { ok: false, texto: 'Banco y cuenta son requeridos.' };
    }

    const supabase = getSupabaseService();
    const bancoNorm = normalizarNombre(bancoTrim);
    const cuentaNorm = normalizarNombre(cuentaTrim);

    const { data: bancoRow, error: bErr } = await supabase
      .from('bancos')
      .select('id')
      .eq('auth_user_id', uid)
      .eq('nombre_normalizado', bancoNorm)
      .maybeSingle();

    if (bErr) {
      return { ok: false, texto: `No se pudo leer el banco: ${bErr.message}` };
    }
    if (!bancoRow || typeof (bancoRow as { id: unknown }).id !== 'string') {
      return { ok: false, texto: 'No se encontró el banco.' };
    }
    const bancoId = (bancoRow as { id: string }).id;

    const { data: cuentas, error: cErr } = await supabase
      .from('cuentas')
      .select('id, nombre')
      .eq('auth_user_id', uid)
      .eq('banco_id', bancoId);

    if (cErr) {
      return { ok: false, texto: `No se pudo leer cuentas: ${cErr.message}` };
    }

    const rows = (cuentas ?? []) as { id: string; nombre: unknown }[];
    const cuenta = rows.find((r) => normalizarNombre(String(r.nombre ?? '')) === cuentaNorm);
    if (!cuenta) {
      return { ok: false, texto: 'No se encontró esa cuenta.' };
    }

    const cuentaId = cuenta.id;

    const { count, error: mErr } = await supabase
      .from('movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('auth_user_id', uid)
      .eq('cuenta_id', cuentaId);

    if (mErr) {
      return { ok: false, texto: `No se pudo comprobar movimientos: ${mErr.message}` };
    }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        texto:
          'Esta cuenta tiene movimientos en el historial. Primero reviértelos desde el chat (ej. «borra la operación de …») y luego podrás eliminar la tarjeta.',
      };
    }

    const { error: delErr } = await supabase.from('cuentas').delete().eq('id', cuentaId).eq('auth_user_id', uid);

    if (delErr) {
      return { ok: false, texto: delErr.message || 'No se pudo eliminar la cuenta.' };
    }

    const label = `${bancoTrim} · ${cuentaTrim}`;
    return { ok: true, texto: `✔ Cuenta eliminada: ${label}` };
  });
}
