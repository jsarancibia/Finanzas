import { loadReglas } from '../config/loadReglas.js';
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
 * Buffer solo en memoria del proceso. En despliegues serverless (p. ej. Vercel) se pierde entre
 * invocaciones; más adelante conviene persistir contexto en BD o no depender de este buffer.
 * Por ahora se mantiene así (arquitectura: memoria ligera local).
 */
const buffer: MensajeContexto[] = [];

export function registrarMensajeContexto(rol: RolContexto, texto: string): void {
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
  return [...buffer];
}

export function limpiarContextoMensajes(): void {
  buffer.length = 0;
}

/**
 * Texto mínimo para acompañar al último mensaje hacia el modelo (sin historial completo).
 */
export function contextoCompactoParaModelo(): string {
  if (buffer.length === 0) {
    return '';
  }
  return buffer.map((m) => `${m.rol}: ${m.texto}`).join('\n');
}

/** Fila de balances más reciente (si hay varias), o null. */
export async function obtenerSaldosBalancesDesdeBd(): Promise<{
  saldo_disponible: number;
  saldo_ahorrado: number;
  saldo_disponible_sin_cuenta: number;
} | null> {
  try {
    const { data, error } = await getSupabaseService()
      .from('balances')
      .select('saldo_disponible, saldo_ahorrado, saldo_disponible_sin_cuenta')
      .order('ultima_actualizacion', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const disp = data.saldo_disponible;
    const ahor = data.saldo_ahorrado;
    const scRaw = (data as { saldo_disponible_sin_cuenta?: unknown }).saldo_disponible_sin_cuenta;
    if (disp === null || ahor === null) {
      return null;
    }

    const sc = scRaw != null && Number.isFinite(Number(scRaw)) ? Number(scRaw) : 0;

    return {
      saldo_disponible: Number(disp),
      saldo_ahorrado: Number(ahor),
      saldo_disponible_sin_cuenta: sc,
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
