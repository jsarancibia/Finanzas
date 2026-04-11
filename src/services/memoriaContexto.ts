import { AsyncLocalStorage } from 'node:async_hooks';

import { loadReglas } from '../config/loadReglas.js';
import { fetchAllBalanceRows } from './fetchBalancesRows.js';
import { getSupabaseService } from './supabaseClient.js';

/**
 * DISEÑO DE MEMORIA (arquitectura.md)
 * 1) Base de datos estructurada — principal (movimientos, balances, cuentas en Supabase).
 * 2) Memoria ligera — solo últimos mensajes en este proceso (no historial completo).
 * 3) Resumen financiero opcional — derivado de balances en BD, no del modelo.
 */

/** Cantidad máxima de turnos recientes a conservar para contexto (evitar historial completo). */
export const MAX_ULTIMOS_MENSAJES = 10;

export type RolContexto = 'user' | 'assistant';

export interface MensajeContexto {
  rol: RolContexto;
  texto: string;
}

/**
 * Alcance por usuario (auth) para no mezclar buffers si hubiera concurrencia en el mismo proceso.
 * CLI / sin usuario usa la clave `cli`.
 */
const contextoScopeStorage = new AsyncLocalStorage<string>();

const buffers = new Map<string, MensajeContexto[]>();

function scopeKey(): string {
  return contextoScopeStorage.getStore() ?? 'cli';
}

const UUID_CTX = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** UUID del usuario en el contexto async actual (chat web con sesión). */
export function getAuthUserIdDesdeContexto(): string | null {
  const k = scopeKey();
  if (!k || k === 'anon' || k === 'cli') {
    return null;
  }
  return UUID_CTX.test(k) ? k : null;
}

function getBuffer(): MensajeContexto[] {
  const k = scopeKey();
  let b = buffers.get(k);
  if (!b) {
    b = [];
    buffers.set(k, b);
  }
  return b;
}

/**
 * Ejecuta el manejo del turno de chat con memoria aislada por usuario autenticado (o `anon`).
 */
export async function withContextoUsuario<T>(
  authUserId: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const key =
    authUserId && typeof authUserId === 'string' && authUserId.trim()
      ? authUserId.trim()
      : 'anon';
  return contextoScopeStorage.run(key, fn);
}

export function registrarMensajeContexto(rol: RolContexto, texto: string): void {
  const buffer = getBuffer();
  const t = texto.trim();
  if (!t) {
    return;
  }
  buffer.push({ rol, texto: t });
  while (buffer.length > MAX_ULTIMOS_MENSAJES) {
    buffer.shift();
  }
}

/** Últimos mensajes en orden cronológico (los más antiguos primero). */
export function obtenerUltimosMensajesParaContexto(): MensajeContexto[] {
  return [...getBuffer()];
}

export function limpiarContextoMensajes(): void {
  buffers.delete(scopeKey());
}

/**
 * Texto mínimo para acompañar al último mensaje hacia el modelo (sin historial completo).
 */
export function contextoCompactoParaModelo(): string {
  const buffer = getBuffer();
  if (buffer.length === 0) {
    return '';
  }
  return buffer.map((m) => `${m.rol}: ${m.texto}`).join('\n');
}

/** Saldos agregados de `balances` (si hubo varias filas, se suman; alinea con el dashboard). */
export async function obtenerSaldosBalancesDesdeBd(): Promise<{
  saldo_disponible: number;
  saldo_ahorrado: number;
  saldo_disponible_sin_cuenta: number;
} | null> {
  try {
    const uid = getAuthUserIdDesdeContexto();
    if (!uid) {
      return null;
    }
    const data = await fetchAllBalanceRows(uid);
    if (!data.length) {
      return null;
    }

    let saldo_disponible = 0;
    let saldo_ahorrado = 0;
    let saldo_disponible_sin_cuenta = 0;
    for (const row of data) {
      const disp = row.saldo_disponible;
      const ahor = row.saldo_ahorrado;
      const scRaw = row.saldo_disponible_sin_cuenta;
      if (disp != null && Number.isFinite(Number(disp))) {
        saldo_disponible += Number(disp);
      }
      if (ahor != null && Number.isFinite(Number(ahor))) {
        saldo_ahorrado += Number(ahor);
      }
      if (scRaw != null && Number.isFinite(Number(scRaw))) {
        saldo_disponible_sin_cuenta += Number(scRaw);
      }
    }

    // Coherencia con cuentas «disponible» + pool (evita total desfasado vs tarjetas si `balances` quedó atrás)
    const { data: filasDisp, error: errDisp } = await getSupabaseService()
      .from('cuentas')
      .select('saldo')
      .eq('auth_user_id', uid)
      .eq('tipo', 'disponible');
    if (!errDisp && Array.isArray(filasDisp)) {
      let sumaCuentasDisp = 0;
      for (const r of filasDisp) {
        const s = Number((r as { saldo?: unknown }).saldo);
        if (Number.isFinite(s)) sumaCuentasDisp += Math.round(s);
      }
      const desdeCuentasYPool = sumaCuentasDisp + Math.round(saldo_disponible_sin_cuenta);
      saldo_disponible = Math.max(Math.round(saldo_disponible), desdeCuentasYPool);
    } else {
      saldo_disponible = Math.round(saldo_disponible);
    }
    saldo_ahorrado = Math.round(saldo_ahorrado);
    saldo_disponible_sin_cuenta = Math.round(saldo_disponible_sin_cuenta);

    return {
      saldo_disponible,
      saldo_ahorrado,
      saldo_disponible_sin_cuenta,
    };
  } catch {
    return null;
  }
}

/**
 * Resumen financiero opcional leído solo desde BD (fuente de verdad).
 * Devuelve null si no hay fila, error de API o falta configuración (nunca lanza).
 */
export async function obtenerResumenFinancieroOpcional(): Promise<string | null> {
  const saldos = await obtenerSaldosBalancesDesdeBd();
  if (!saldos) {
    return null;
  }
  const reglas = loadReglas();
  return `${reglas.moneda}: disponible ${saldos.saldo_disponible} (sin cuenta ${saldos.saldo_disponible_sin_cuenta}), ahorrado ${saldos.saldo_ahorrado} (desde balances en BD).`;
}
