import 'dotenv/config';

import { loadReglas } from '../config/loadReglas.js';
import { formatoMontoAsistente } from '../services/formatoMoneda.js';
import {
  obtenerSaldosBalancesDesdeBd,
  withContextoUsuario,
} from '../services/memoriaContexto.js';
import { getSupabaseService } from '../services/supabaseClient.js';

export interface IngresoCuentaResponse {
  texto: string;
  ok: boolean;
}

/**
 * Registra un ingreso directo a una cuenta específica sin pasar por el pool
 * «disponible sin cuenta». arquitectura12 — Caso 2 y Caso 3.
 *
 * - Aumenta saldo_disponible (la cuenta es tipo disponible/ahorro/inversion)
 * - NO aumenta saldo_disponible_sin_cuenta
 * - Actualiza el saldo de la cuenta concreta
 */
export async function handleIngresoCuentaPost(
  monto: number,
  banco: string,
  cuentaProducto: string,
  authUserId: string,
): Promise<IngresoCuentaResponse> {
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

    const reglas = loadReglas();
    const destino = `${bancoTrim} · ${cuentaTrim}`;

    const { data, error } = await getSupabaseService().rpc('aplicar_movimiento', {
      p_auth_user_id: authUserId.trim(),
      p_tipo: 'ingreso',
      p_monto: montoRedondeado,
      p_categoria: 'ingreso_directo',
      p_descripcion: `Ingreso directo a ${destino}`,
      p_origen: '',
      p_destino: destino,
      p_banco: bancoTrim,
      p_cuenta_producto: cuentaTrim,
    });

    if (error) {
      return { texto: 'No se pudo guardar. Revisa conexión o permisos.', ok: false };
    }

    const row = data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
    if (!row?.ok) {
      const err = typeof row?.error === 'string' ? row.error : 'rechazado';
      if (err === 'saldo_insuficiente') {
        return { texto: 'Saldo disponible insuficiente.', ok: false };
      }
      return { texto: `Error al registrar: ${err}`, ok: false };
    }

    const m = formatoMontoAsistente(montoRedondeado, reglas);
    const saldos = await obtenerSaldosBalancesDesdeBd();
    const lineas = [`✔ Ingreso registrado: ${m} → ${destino}`];
    if (saldos) {
      lineas.push(`Saldo disponible: ${formatoMontoAsistente(saldos.saldo_disponible, reglas)}`);
    }

    return { texto: lineas.join('\n'), ok: true };
  });
}
