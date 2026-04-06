import {
  buscarMontoEnTextoCompleto,
  extractLeadingMonto,
} from './parseMessage.js';
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
 * Coloquial: «deja (dinero) disponible 120.000 en cuenta rut para gastar (de los 300.000)».
 * Es asignación desde el colchón pendiente, no un ingreso nuevo.
 */
function parseDejarDisponibleEnCuenta(raw: string): ParsedAsignacionSinCuenta | null {
  const t = raw.trim().normalize('NFC');
  const lower = t.toLowerCase();
  const idxDisponible = lower.indexOf('disponible');
  if (idxDisponible < 0) {
    return null;
  }

  const beforeDisp = t.slice(0, idxDisponible);
  if (!/\bdeja(?:r|me|mos)?\b|\bdejá\b|\bdej[eé]\b/i.test(beforeDisp)) {
    return null;
  }

  const afterDisponible = t.slice(idxDisponible + 'disponible'.length).trim();
  const extracted = extractLeadingMonto(afterDisponible);
  if (!extracted || extracted.monto <= 0) {
    return null;
  }

  let rest = extracted.rest;
  const enMatch = /^\s*en\s+(?:la\s+)?(.+)$/iu.exec(rest);
  const aMatch = /^\s*a\s+(?:la\s+)?(.+)$/iu.exec(rest);
  const alMatch = /^\s*al\s+(.+)$/iu.exec(rest);
  let tail = (enMatch?.[1] ?? aMatch?.[1] ?? alMatch?.[1] ?? '').trim();
  if (!tail) {
    return null;
  }

  tail = tail.split(/\s+para\s+/i)[0].trim();
  tail = tail.replace(/\s+de\s+(?:los|las)\s+[\d.,]+(?:\s+lucas?)?\s*$/iu, '').trim();
  tail = tail.replace(/[.!?]+$/u, '').trim();

  const mapped = mapExtremoTraspaso(tail);
  if (!mapped) {
    return null;
  }
  return { monto: extracted.monto, banco: mapped.banco, cuentaProducto: mapped.cuenta };
}

/**
 * Asignar monto del pool a una cuenta: frase explícita «disponible sin cuenta» **o** coloquial «deja … disponible … en …».
 */
export function parseAsignarDesdeDisponibleSinCuenta(text: string): ParsedAsignacionSinCuenta | null {
  const raw = text.trim().normalize('NFC');
  if (!raw) {
    return null;
  }

  if (mencionaDisponibleSinCuentaPool(raw)) {
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

  return parseDejarDisponibleEnCuenta(raw);
}

const MSG_PEDIR_MONTO_ASIGNACION =
  'Para sacar plata de «disponible sin cuenta» y asignarla a una cuenta, indica el monto y el destino. Ejemplos: «80000 del disponible sin cuenta en cuenta rut», «deja disponible 50000 en Mercado Pago», «deja dinero disponible 120000 en la cuenta rut para gastar».';

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
