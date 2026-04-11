import {
  buscarMontoEnTextoCompleto,
  destinoParaRegistro,
  extraerOrigenDisponibleParaAhorro,
  extractLeadingMonto,
  type ParsedMovimiento,
} from './parseMessage.js';
import { detectBanco, detectProducto } from './parseMessageFlexible.js';

export type ParsedTraspaso = {
  monto: number;
  origenBanco: string;
  origenCuenta: string;
  destinoBanco: string;
  destinoCuenta: string;
};

/**
 * Extrae subcuenta de un fragmento eliminando el nombre del banco y preposiciones.
 * "reservas de mercado pago" → "Reservas"; "la cuenta de mercado pago" → null (genérico).
 */
function extraerSubcuentaDeFragmento(frag: string, bancoPattern: RegExp): string | null {
  const rest = frag
    .replace(bancoPattern, '')
    .replace(/\b(de|del|la|el|los|las|en|al|mi|su|a)\b/gi, '')
    .replace(/[,;.]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rest || /^cuenta$/i.test(rest) || rest.length < 2) {
    return null;
  }
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * Interpreta un extremo del traspaso (ej. "cuenta rut", "mercado pago", "reservas de mercado pago").
 */
export function mapExtremoTraspaso(frag: string): { banco: string; cuenta: string } | null {
  const s = frag.trim().replace(/\s+/g, ' ');
  if (!s) {
    return null;
  }
  if (/\bcuenta\s*rut\b|\brut\s+cuenta\b/i.test(s) || (/\brut\b/i.test(s) && /\bestado\b/i.test(s))) {
    return { banco: 'Banco Estado', cuenta: 'Cuenta RUT' };
  }
  const prod = detectProducto(s);
  if (/\bmercado\s+libre\b/i.test(s)) {
    if (prod) return { banco: 'Mercado Pago', cuenta: prod };
    const sub = extraerSubcuentaDeFragmento(s, /\bmercado\s+libre\b/i);
    return { banco: 'Mercado Pago', cuenta: sub || 'Disponible' };
  }
  if (/\bmercado\s+pago\b/i.test(s)) {
    if (prod) return { banco: 'Mercado Pago', cuenta: prod };
    const sub = extraerSubcuentaDeFragmento(s, /\bmercado\s+pago\b/i);
    // Sin subcuenta explícita: la cuenta principal en la app suele llamarse «Mercado Pago», no «Disponible».
    return { banco: 'Mercado Pago', cuenta: sub || 'Mercado Pago' };
  }
  const b = detectBanco(s);
  if (b && prod) {
    return { banco: b, cuenta: prod };
  }
  if (b) {
    return { banco: b, cuenta: b === 'Mercado Pago' ? 'Mercado Pago' : 'Disponible' };
  }
  if (/\befectivo\b/i.test(s)) {
    return { banco: 'Efectivo', cuenta: 'Efectivo' };
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
 * También acepta «saqué X de A, y lo pasé a B» y «50000 de cuenta rut a mercado pago».
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

  /**
   * «del dinero de mercado pago disponible, pasa 30000 a cuenta rut» (traspaso entre disponibles).
   * No usar si el destino es ahorro/reservas: eso va por `aplicar_movimiento` tipo ahorro + origen.
   */
  const pareceDestinoAhorro = /\bahorro\b/i.test(raw) || /\breservas\b/i.test(raw);
  const oo = extraerOrigenDisponibleParaAhorro(raw);
  if (oo && !pareceDestinoAhorro && !/\bdisponible\s+sin\s+cuenta\b/i.test(raw)) {
    const mi = /\bpas(?:a|ar|é|e)\b/i.exec(raw);
    if (mi) {
      const after = raw.slice(mi.index + mi[0].length).trim();
      const ext = extractLeadingMonto(after);
      if (ext && ext.monto > 0) {
        const destRaw = ext.rest.replace(/^\s*,?\s*a\s+/i, '').trim();
        if (destRaw) {
          const destino = mapExtremoTraspaso(destRaw);
          if (destino) {
            const oNorm = `${oo.banco}\u00b7${oo.cuentaProducto}`.toLowerCase().replace(/\s+/g, '');
            const dNorm = `${destino.banco}\u00b7${destino.cuenta}`.toLowerCase().replace(/\s+/g, '');
            if (oNorm !== dNorm) {
              return {
                monto: ext.monto,
                origenBanco: oo.banco,
                origenCuenta: oo.cuentaProducto,
                destinoBanco: destino.banco,
                destinoCuenta: destino.cuenta,
              };
            }
          }
        }
      }
    }
  }

  // «saqué/saque/retiré X de A, y lo pasé/mandé a B»
  const mSaque =
    /(?:saqu[eé]|saque|retir[eé]|retire)\s+[\d.,]+\s*(?:k|mil|lucas?)?\s+(?:de|desde)\s+(.+?),?\s+y\s+(?:lo\s+)?(?:pas[eéoa]r?|mand[eéoa]r?|transfer[ií]r?|mov[ií]|llev[eé]|deposit[eéoa]r?)\s+(?:a|al|en)\s+(.+)$/i.exec(raw);
  if (mSaque) {
    const origen = mapExtremoTraspaso(mSaque[1].trim());
    const destino = mapExtremoTraspaso(mSaque[2].trim());
    if (origen && destino && !(origen.banco === destino.banco && origen.cuenta === destino.cuenta)) {
      return { monto, origenBanco: origen.banco, origenCuenta: origen.cuenta, destinoBanco: destino.banco, destinoCuenta: destino.cuenta };
    }
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
