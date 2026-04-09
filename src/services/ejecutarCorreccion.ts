import { loadCorrecciones } from '../config/loadCorrecciones.js';
import { loadReglas } from '../config/loadReglas.js';
import { formatoMontoAsistente } from './formatoMoneda.js';
import { getAuthUserIdDesdeContexto, obtenerSaldosBalancesDesdeBd } from './memoriaContexto.js';
import { parseIntencionCorreccion } from './parseCorrecciones.js';
import type { ProcessCorreccionOk, ProcessResult } from './processMessage.js';
import { getSupabaseService } from './supabaseClient.js';

function rpcRow(data: unknown): { ok?: boolean; error?: string } | null {
  if (data === null || typeof data !== 'object') {
    return null;
  }
  return data as { ok?: boolean; error?: string };
}

/**
 * Intenta ejecutar una corrección (undo / borrar / corregir monto). Va antes del parser financiero normal.
 */
export async function tryEjecutarCorreccion(text: string): Promise<ProcessResult | null> {
  const cfg = loadCorrecciones();
  const intent = parseIntencionCorreccion(text, cfg);
  if (!intent) {
    return null;
  }

  const uid = getAuthUserIdDesdeContexto();
  if (!uid) {
    return null;
  }

  const reglas = loadReglas();
  const prefijo = reglas.respuestas.confirmaciones ? '✔ ' : '';

  if (intent.accion === 'revertir') {
    const { data, error } = await getSupabaseService().rpc('revertir_ultimo_movimiento', {
      p_auth_user_id: uid,
      p_monto_filtro: intent.montoFiltro,
    });

    if (error) {
      return { ok: false, phase: 'rpc', error: error.message };
    }
    const row = rpcRow(data);
    if (!row?.ok) {
      const err = typeof row?.error === 'string' ? row.error : 'rechazado';
      return { ok: false, phase: 'resultado', error: err };
    }

    const saldos = await obtenerSaldosBalancesDesdeBd();
    let cuerpo =
      intent.montoFiltro != null
        ? `${prefijo}Listo: quité el movimiento de ${formatoMontoAsistente(intent.montoFiltro, reglas)}.`
        : `${prefijo}Listo: deshice el último movimiento.`;
    if (saldos && reglas.respuestas.confirmaciones) {
      cuerpo += `\nSaldo disponible: ${formatoMontoAsistente(saldos.saldo_disponible, reglas)}`;
      cuerpo += `\nSaldo ahorrado: ${formatoMontoAsistente(saldos.saldo_ahorrado, reglas)}`;
    }
    const out: ProcessCorreccionOk = { ok: true, kind: 'correccion', mensaje: cuerpo };
    return out;
  }

  const { data, error } = await getSupabaseService().rpc('corregir_monto_ultimo_movimiento', {
    p_auth_user_id: uid,
    p_monto_anterior: intent.montoAnterior,
    p_monto_nuevo: intent.montoNuevo,
  });

  if (error) {
    return { ok: false, phase: 'rpc', error: error.message };
  }
  const row = rpcRow(data);
  if (!row?.ok) {
    const err = typeof row?.error === 'string' ? row.error : 'rechazado';
    return { ok: false, phase: 'resultado', error: err };
  }

  const saldos = await obtenerSaldosBalancesDesdeBd();
  const nuevoStr = formatoMontoAsistente(intent.montoNuevo, reglas);
  let cuerpo = `${prefijo}Monto corregido a ${nuevoStr}.`;
  if (intent.montoAnterior != null) {
    cuerpo = `${prefijo}Corregí de ${formatoMontoAsistente(intent.montoAnterior, reglas)} a ${nuevoStr}.`;
  }
  if (saldos && reglas.respuestas.confirmaciones) {
    cuerpo += `\nSaldo disponible: ${formatoMontoAsistente(saldos.saldo_disponible, reglas)}`;
    cuerpo += `\nSaldo ahorrado: ${formatoMontoAsistente(saldos.saldo_ahorrado, reglas)}`;
  }
  const out: ProcessCorreccionOk = { ok: true, kind: 'correccion', mensaje: cuerpo };
  return out;
}
