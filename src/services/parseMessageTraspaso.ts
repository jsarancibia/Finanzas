import { buscarMontoEnTextoCompleto, destinoParaRegistro, type ParsedMovimiento } from './parseMessage.js';
import { detectBanco, detectProducto } from './parseMessageFlexible.js';

export type ParsedTraspaso = {
  monto: number;
  origenBanco: string;
  origenCuenta: string;
  destinoBanco: string;
  destinoCuenta: string;
};

/**
 * Interpreta un extremo del traspaso (ej. "cuenta rut", "mercado pago", "Banco Estado cuenta corriente").
 */
export function mapExtremoTraspaso(frag: string): { banco: string; cuenta: string } | null {
  const s = frag.trim().replace(/\s+/g, ' ');
  if (!s) {
    return null;
  }
  if (/\bcuenta\s*rut\b|\brut\s+cuenta\b/i.test(s) || (/\brut\b/i.test(s) && /\bestado\b/i.test(s))) {
    return { banco: 'Banco Estado', cuenta: 'Cuenta RUT' };
  }
  if (/\bmercado\s+pago\b/i.test(s)) {
    const prod = detectProducto(s);
    return { banco: 'Mercado Pago', cuenta: prod || 'Disponible' };
  }
  const b = detectBanco(s);
  const c = detectProducto(s);
  if (b && c) {
    return { banco: b, cuenta: c };
  }
  if (b) {
    return { banco: b, cuenta: 'Disponible' };
  }
  return null;
}

const MSG_PEDIR_MONTO_TRASPASO =
  'Para registrar un traspaso entre cuentas necesito el monto en pesos. Ejemplos: «pasé 80000 de Cuenta RUT a Mercado Pago», «traspasé 50000 desde Mercado Pago a Cuenta RUT».';

const MSG_NOTA_DISTRIBUCION =
  'Este asistente no guarda reglas como «lo que no está en la Cuenta RUT está en Mercado Pago». Para que los saldos cuadren, anota cada movimiento con monto. Si moviste plata a Mercado Pago para gastar, escríbelo así: «pasé [monto] de Cuenta RUT a Mercado Pago».';

/**
 * Mensaje descriptivo sin cifra (dónde está el disponible): orientación sin RPC.
 */
export function textoNotaDistribucionDisponibleSiAplica(text: string): string | null {
  const t = text.trim().normalize('NFC');
  if (!t || t.length > 220) {
    return null;
  }
  if (buscarMontoEnTextoCompleto(t) != null) {
    return null;
  }
  const lower = t.toLowerCase();
  if (!/\bmercado\s+pago\b/i.test(lower)) {
    return null;
  }
  if (!/\bcuenta\s*rut\b|\brut\b/i.test(lower)) {
    return null;
  }
  if (!/\bdisponible\b|\bdinero\b|\btodo\b|\bestá\b|\besta\b|\bestán\b|\bestan\b/i.test(lower)) {
    return null;
  }
  if (/\b(pasé|pase|pasar|traspas|transfer)/i.test(lower)) {
    return null;
  }
  return MSG_NOTA_DISTRIBUCION;
}

/**
 * Intención de traspaso / mover a MP sin cifra.
 */
export function textoPedirMontoTraspasoSiAplica(text: string): string | null {
  const t = text.trim().normalize('NFC');
  if (!t || t.length > 280) {
    return null;
  }
  if (buscarMontoEnTextoCompleto(t) != null) {
    return null;
  }
  const lower = t.toLowerCase();
  const quiereMover =
    /\b(pas(ar|é|e|o|a|arlo|rlo)|traspas|transfer(ir|í|i)|mov(er|í|i)|llevar|depositar)\b/i.test(
      lower,
    );
  const hayMp = /\bmercado\s+pago\b/i.test(lower);
  const hayRutOdisp =
    /\bcuenta\s*rut\b|\brut\b|\bdisponible\b/i.test(lower) || /\bpara\s+gastar\b/i.test(lower);
  if (quiereMover && hayMp && hayRutOdisp) {
    return MSG_PEDIR_MONTO_TRASPASO;
  }
  if (quiereMover && hayMp && /(?:de|desde)\s+/i.test(lower) && /\s+a\s+|\s+al\s+/i.test(lower)) {
    return MSG_PEDIR_MONTO_TRASPASO;
  }
  return null;
}

/**
 * Traspaso entre cuentas: requiere monto y patrón «de X a Y» / «desde X a Y».
 * También acepta frases tipo «50000 de cuenta rut a mercado pago».
 */
export function parseTraspaso(text: string): ParsedTraspaso | null {
  const raw = text.trim().normalize('NFC');
  if (!raw) {
    return null;
  }
  const monto = buscarMontoEnTextoCompleto(raw);
  if (monto == null || monto <= 0) {
    return null;
  }
  const m = /(?:de|desde)\s+(.+?)\s+(?:a|al)\s+(.+)$/i.exec(raw);
  if (!m) {
    return null;
  }
  const origenFrag = m[1].trim();
  const destFrag = m[2].trim();
  const origen = mapExtremoTraspaso(origenFrag);
  const destino = mapExtremoTraspaso(destFrag);
  if (!origen || !destino) {
    return null;
  }
  if (origen.banco === destino.banco && origen.cuenta === destino.cuenta) {
    return null;
  }
  return {
    monto,
    origenBanco: origen.banco,
    origenCuenta: origen.cuenta,
    destinoBanco: destino.banco,
    destinoCuenta: destino.cuenta,
  };
}

export function parsedMovimientoGastoTraspaso(p: ParsedTraspaso): ParsedMovimiento {
  const base: ParsedMovimiento = {
    tipo: 'gasto',
    monto: p.monto,
    categoria: 'transferencia',
    descripcion: `traspaso → ${p.destinoBanco}`,
    origen: null,
    destino: null,
    banco: p.origenBanco,
    cuentaProducto: p.origenCuenta,
  };
  return { ...base, destino: destinoParaRegistro(base) };
}

export function parsedMovimientoIngresoTraspaso(p: ParsedTraspaso): ParsedMovimiento {
  const base: ParsedMovimiento = {
    tipo: 'ingreso',
    monto: p.monto,
    categoria: '',
    descripcion: `traspaso desde ${p.origenCuenta}`,
    origen: null,
    destino: null,
    banco: p.destinoBanco,
    cuentaProducto: p.destinoCuenta,
  };
  return { ...base, destino: destinoParaRegistro(base) };
}
