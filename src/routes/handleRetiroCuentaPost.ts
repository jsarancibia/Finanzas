import 'dotenv/config';

import { loadReglas } from '../config/loadReglas.js';
import { formatoMontoAsistente } from '../services/formatoMoneda.js';
import {
  obtenerSaldosBalancesDesdeBd,
  withContextoUsuario,
} from '../services/memoriaContexto.js';
import { getSupabaseService } from '../services/supabaseClient.js';

export interface RetiroCuentaResponse {
  texto: string;
  ok: boolean;
}

function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Retira dinero desde una cuenta de ahorro/inversión.
 *
 * No usa el RPC de movimientos porque `gasto` descuenta saldo disponible.
 * Este flujo solo ajusta la cuenta de ahorro y el total ahorrado.
 */
export async function handleRetiroCuentaPost(
  monto: number,
  banco: string,
  cuentaProducto: string,
  authUserId: string,
): Promise<RetiroCuentaResponse> {
  return withContextoUsuario(authUserId, async () => {
    if (!authUserId?.trim()) {
      return { texto: 'No autorizado.', ok: false };
    }

    const montoRedondeado = Math.round(Number(monto));
    if (!Number.isFinite(montoRedondeado) || montoRedondeado <= 0) {
      return { texto: 'Monto no válido.', ok: false };
    }

    const bancoTrim = banco?.trim() ?? '';
    const cuentaTrim = cuentaProducto?.trim() ?? '';
    if (!bancoTrim || !cuentaTrim) {
      return { texto: 'Banco y cuenta son requeridos.', ok: false };
    }

    const supabase = getSupabaseService();
    const uid = authUserId.trim();
    const reglas = loadReglas();
    const bancoNorm = normalizarNombre(bancoTrim);

    const { data: bancoRow, error: bancoErr } = await supabase
      .from('bancos')
      .select('id')
      .eq('auth_user_id', uid)
      .eq('nombre_normalizado', bancoNorm)
      .maybeSingle();

    if (bancoErr || !bancoRow || typeof (bancoRow as { id?: unknown }).id !== 'string') {
      return { texto: 'No se encontró el banco de esa cuenta.', ok: false };
    }

    const bancoId = (bancoRow as { id: string }).id;
    const { data: cuentaRow, error: cuentaErr } = await supabase
      .from('cuentas')
      .select('id, nombre, tipo, saldo')
      .eq('auth_user_id', uid)
      .eq('banco_id', bancoId)
      .eq('nombre', cuentaTrim)
      .maybeSingle();

    if (cuentaErr || !cuentaRow) {
      return { texto: 'No se encontró la cuenta de ahorro.', ok: false };
    }

    const cuenta = cuentaRow as { id: string; nombre: string; tipo: string; saldo: number | string };
    if (cuenta.tipo !== 'ahorro' && cuenta.tipo !== 'inversion') {
      return { texto: 'Los retiros con este botón solo están disponibles para cuentas de ahorro.', ok: false };
    }

    const saldoActual = Number(cuenta.saldo);
    if (!Number.isFinite(saldoActual) || saldoActual < montoRedondeado) {
      return { texto: 'Saldo insuficiente en esa cuenta de ahorro.', ok: false };
    }

    const { error: updCuentaErr } = await supabase
      .from('cuentas')
      .update({ saldo: saldoActual - montoRedondeado })
      .eq('auth_user_id', uid)
      .eq('id', cuenta.id);

    if (updCuentaErr) {
      return { texto: 'No se pudo actualizar la cuenta.', ok: false };
    }

    const { data: balanceRow } = await supabase
      .from('balances')
      .select('saldo_ahorrado')
      .eq('auth_user_id', uid)
      .maybeSingle();

    const saldoAhorrado = Number((balanceRow as { saldo_ahorrado?: unknown } | null)?.saldo_ahorrado ?? 0);
    await supabase
      .from('balances')
      .update({
        saldo_ahorrado: Math.max(0, (Number.isFinite(saldoAhorrado) ? saldoAhorrado : 0) - montoRedondeado),
        ultima_actualizacion: new Date().toISOString(),
      })
      .eq('auth_user_id', uid);

    await supabase.from('movimientos').insert({
      tipo: 'ahorro',
      monto: -montoRedondeado,
      categoria: 'retiro_ahorro',
      descripcion: `Retiro desde ${bancoTrim} · ${cuentaTrim}`,
      origen: `${bancoTrim} · ${cuentaTrim}`,
      destino: 'retiro',
      cuenta_id: cuenta.id,
      auth_user_id: uid,
    });

    const m = formatoMontoAsistente(montoRedondeado, reglas);
    const saldos = await obtenerSaldosBalancesDesdeBd();
    const lineas = [`✔ Retiro registrado: ${m} desde ${bancoTrim} · ${cuentaTrim}`];
    if (saldos) {
      lineas.push(`Saldo ahorrado: ${formatoMontoAsistente(saldos.saldo_ahorrado, reglas)}`);
    }
    return { texto: lineas.join('\n'), ok: true };
  });
}
