import { loadReglas } from '../config/loadReglas.js';
import { fetchAllBalanceRows } from './fetchBalancesRows.js';

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

/** Saldos agregados de `balances` (si hubo varias filas, se suman; alinea con el dashboard). */
export async function obtenerSaldosBalancesDesdeBd(): Promise<{
  saldo_disponible: number;
  saldo_ahorrado: number;
  saldo_disponible_sin_cuenta: number;
} | null> {
  try {
    const data = await fetchAllBalanceRows();
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
