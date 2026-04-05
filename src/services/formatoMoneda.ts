import type { Reglas } from '../config/loadReglas.js';

/**
 * Formato de montos para el asistente (arquitectura: CLP).
 */
export function formatoMontoAsistente(monto: number, reglas: Reglas): string {
  const codigo = reglas.moneda.trim().toUpperCase();
  const n = Math.round(Number(monto));
  if (!Number.isFinite(n)) {
    return String(monto);
  }
  if (codigo === 'CLP') {
    return `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
  }
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })} ${codigo}`;
}
