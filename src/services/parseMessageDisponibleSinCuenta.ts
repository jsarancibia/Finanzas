import { buscarMontoEnTextoCompleto } from './parseMessage.js';
import { mapExtremoTraspaso } from './parseMessageTraspaso.js';

export type ParsedAsignacionSinCuenta = {
  monto: number;
  banco: string;
  cuentaProducto: string;
};

/** El mensaje habla del colchón «disponible sin cuenta» (pool no asignado). */
export function mencionaDisponibleSinCuentaPool(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bdisponible\s+sin\s+cuenta\b/.test(t) ||
    /\bdinero\s+disponible\s+sin\s+cuenta\b/.test(t) ||
    /\bdel\s+sin\s+cuenta\b/.test(t) ||
    /\bdel\s+dinero\s+disponible\s+sin\s+cuenta\b/.test(t) ||
    /\bdesde\s+(?:el\s+)?(?:dinero\s+)?disponible\s+sin\s+cuenta\b/.test(t) ||
    /\bdesde\s+(?:el\s+)?sin\s+cuenta\b/.test(t)
  );
}

/**
 * Asignar monto del pool a una cuenta concreta: requiere mención del pool + monto + destino (en/a/al …).
 */
export function parseAsignarDesdeDisponibleSinCuenta(text: string): ParsedAsignacionSinCuenta | null {
  const raw = text.trim().normalize('NFC');
  if (!raw || !mencionaDisponibleSinCuentaPool(raw)) {
    return null;
  }
  const monto = buscarMontoEnTextoCompleto(raw);
  if (monto == null || monto <= 0) {
    return null;
  }

  const enLa = /\s+en\s+(?:la\s+)?(.+?)\s*$/iu.exec(raw);
  const aLa = /\s+a\s+(?:la\s+)?(.+?)\s*$/iu.exec(raw);
  const al = /\s+al\s+(.+?)\s*$/iu.exec(raw);
  const frag = (enLa?.[1] ?? aLa?.[1] ?? al?.[1] ?? '').trim().replace(/[.!?]+$/u, '');
  if (!frag) {
    return null;
  }

  const mapped = mapExtremoTraspaso(frag);
  if (!mapped) {
    return null;
  }
  return { monto, banco: mapped.banco, cuentaProducto: mapped.cuenta };
}

const MSG_PEDIR_MONTO_ASIGNACION =
  'Para sacar plata de «disponible sin cuenta» y asignarla a una cuenta, indica el monto y el destino. Ejemplos: «80000 del disponible sin cuenta en cuenta rut», «50000 del dinero disponible sin cuenta a Mercado Pago».';

/** Menciona el pool pero no hay cifra (ni destino útil). */
export function textoPedirMontoAsignacionSinCuentaSiAplica(text: string): string | null {
  const raw = text.trim().normalize('NFC');
  if (!raw || !mencionaDisponibleSinCuentaPool(raw)) {
    return null;
  }
  if (buscarMontoEnTextoCompleto(raw) != null) {
    return null;
  }
  return MSG_PEDIR_MONTO_ASIGNACION;
}
