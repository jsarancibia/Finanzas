import { inferirTipoPorTerminosChilenos } from '../config/loadNormalizacionTerminosChilenos.js';
import { inferCategoriaGasto } from './categoriasMovimiento.js';
import {
  buscarMontoEnTextoCompleto,
  destinoParaRegistro,
  type MovimientoTipo,
  type ParsedMovimiento,
} from './parseMessage.js';

const BANK_ALIASES: { pattern: RegExp; nombre: string }[] = [
  { pattern: /\bmercado\s+pago\b/i, nombre: 'Mercado Pago' },
  { pattern: /\bbanco\s+de\s+chile\b/i, nombre: 'Banco de Chile' },
  { pattern: /\bbanco\s+estado\b|\bbancoestado\b/i, nombre: 'Banco Estado' },
  { pattern: /\bbanco\s+santander\b|\bsantander\b/i, nombre: 'Banco Santander' },
  { pattern: /\bscotiabank\b|\bscotia\b/i, nombre: 'Scotiabank' },
  { pattern: /\bbi\s+banco\b|\bbci\b|\bci\s+mazu\b/i, nombre: 'BCI' },
  { pattern: /\bita[uú]\b|\bitau\b/i, nombre: 'Itaú' },
  { pattern: /\bsecurity\b/i, nombre: 'Security' },
  { pattern: /\bfalabella\b|\bcmf\b/i, nombre: 'Banco Falabella' },
  { pattern: /\bconsorcio\b/i, nombre: 'Banco Consorcio' },
];

const PRODUCT_ALIASES: { pattern: RegExp; nombre: string }[] = [
  { pattern: /\bfondo\s+mutuo\b/i, nombre: 'Fondo mutuo' },
  { pattern: /\bcuenta\s+rut\b|\brut\s+cuenta\b/i, nombre: 'Cuenta RUT' },
  { pattern: /\bcuenta\s+corriente\b/i, nombre: 'Cuenta corriente' },
  { pattern: /\bcuenta\s+de\s+ahorro\b|\bcuenta\s+ahorro\b/i, nombre: 'Cuenta de ahorro' },
  { pattern: /\bl[ií]nea\s+de\s+cr[eé]dito\b/i, nombre: 'Línea de crédito' },
  { pattern: /\bapv\b|\bfpv\b/i, nombre: 'APV/FPV' },
];

export function detectBanco(text: string): string | null {
  for (const { pattern, nombre } of BANK_ALIASES) {
    if (pattern.test(text)) {
      return nombre;
    }
  }
  return null;
}

export function detectProducto(text: string): string | null {
  for (const { pattern, nombre } of PRODUCT_ALIASES) {
    if (pattern.test(text)) {
      return nombre;
    }
  }
  return null;
}

/**
 * "… en Mercado Pago en sección de reservas" → subcuenta tras el nombre del banco detectado.
 */
function extraerSubcuentaTrasBanco(raw: string, banco: string | null): string | null {
  if (!banco) {
    return null;
  }
  for (const { pattern, nombre } of BANK_ALIASES) {
    if (nombre !== banco) {
      continue;
    }
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      last = m;
    }
    if (!last) {
      continue;
    }
    const tail = raw.slice(last.index + last[0].length).trim();
    const sub = /^en\s+(.+)$/i.exec(tail);
    if (sub) {
      const label = sub[1].trim().replace(/\s+/g, ' ');
      if (label.length > 0) {
        return label.replace(/^seccion\b/i, 'Sección');
      }
    }
  }
  return null;
}

function detectTipoFlex(lower: string): MovimientoTipo | null {
  if (/\bpasé\b|\bpase\b/.test(lower) && /\bahorro\b/.test(lower)) {
    return 'ahorro';
  }
  if (/\btengo\s+ahorrado\b/.test(lower)) {
    return 'ahorro';
  }
  if (/\btengo\s+un\s+ahorro\s+de\b|\btengo\s+ahorro\s+de\b/.test(lower)) {
    return 'ahorro';
  }
  if (
    /\bagregaré\b|\bagregare\b|\bcolocaré\b|\bcolocare\b|\bagrego\s+un\s+ahorro\s+de\b|\bagregar\s+un\s+ahorro\s+de\b/.test(
      lower,
    )
  ) {
    return 'ahorro';
  }
  if (/\binvertí\b|\binverti\b/.test(lower)) {
    return 'ahorro';
  }
  if (
    /\bguardé\b|\bguarde\b|\bahorré\b|\bahorre\b|\bahorraré\b|\bahorrare\b|\bahorrar\b|\bdejé\b|\bdeje\b|\baparté\b|\baparte\b|\bmetí\b|\bmeti\b/.test(
      lower,
    )
  ) {
    return 'ahorro';
  }
  if (
    /\bme\s+pagaron\b|\bme\s+depositaron\b|\bme\s+llegaron\b|\bme\s+llegó\b|\bme\s+llego\b/.test(
      lower,
    )
  ) {
    return 'ingreso';
  }
  if (/\bsueldo\b/.test(lower) && /\brecib[ií]\b|\brecibi\b|\bcobr[eé]\b|\bcobre\b/.test(lower)) {
    return 'ingreso';
  }
  if (/\bpara\s+gastar\b/.test(lower)) {
    return 'ingreso';
  }
  if (/\btengo\b/.test(lower) && /\bdisponible\b/.test(lower)) {
    return 'ingreso';
  }
  if (/\bdispongo\b/.test(lower) && /\bdisponible\b/.test(lower)) {
    return 'ingreso';
  }
  if (/\b(quedan?|hay)\b/.test(lower) && /\bdisponible\b/.test(lower) && /\bsin\s+cuenta\b/.test(lower)) {
    return 'ingreso';
  }
  if (/\bdisponible\b/.test(lower) && /\bsin\s+cuenta\b/.test(lower) && /\b(mil|lucas|k\b|\d)/i.test(lower)) {
    return 'ingreso';
  }
  if (/\bgasté\b|\bgaste\b|\bgastó\b/.test(lower)) {
    return 'gasto';
  }
  if (/\bgasto\b/.test(lower) && /\d/.test(lower)) {
    return 'gasto';
  }
  if (/\bsaqué\b|\bsaque\b/.test(lower)) {
    return 'gasto';
  }
  const desdeJson = inferirTipoPorTerminosChilenos(lower);
  if (desdeJson) {
    return desdeJson;
  }
  return null;
}

function tailTrasEn(raw: string): string {
  const m = /\s+en\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : '';
}

/**
 * Rellena banco / cuenta desde el texto cuando el regex o el LLM solo dejaron `destino` libre.
 * Así el RPC puede enlazar `cuenta_id` en ahorros e ingresos con mención explícita de banco/producto.
 */
export function enriquecerBancoYProducto(raw: string, p: ParsedMovimiento): ParsedMovimiento {
  const t = raw.trim().normalize('NFC');
  if (!t || (p.tipo !== 'ahorro' && p.tipo !== 'ingreso')) {
    return p;
  }

  let banco = p.banco?.trim() || null;
  let cuentaProducto = p.cuentaProducto?.trim() || null;
  if (!banco) {
    banco = detectBanco(t);
  }
  if (!cuentaProducto) {
    cuentaProducto = detectProducto(t);
  }
  if (p.tipo === 'ahorro' && banco) {
    const sub = extraerSubcuentaTrasBanco(t, banco);
    if (sub) {
      cuentaProducto = sub;
    }
  }
  if (p.tipo === 'ahorro' && banco && !cuentaProducto) {
    cuentaProducto = 'Ahorro';
  }
  if (
    p.tipo === 'ingreso' &&
    /\bcuenta\s*rut\b|\ben\s+la\s+rut\b|\bmi\s+rut\b/i.test(t)
  ) {
    cuentaProducto = cuentaProducto ?? 'Cuenta RUT';
    banco = banco ?? 'Banco Estado';
  }

  if (
    (p.banco?.trim() || null) === banco &&
    (p.cuentaProducto?.trim() || null) === cuentaProducto
  ) {
    return p;
  }

  const next: ParsedMovimiento = {
    ...p,
    banco: banco || null,
    cuentaProducto: cuentaProducto || null,
  };
  return {
    ...next,
    destino: destinoParaRegistro(next),
  };
}

/**
 * Parser tolerante: monto y palabras clave en cualquier parte del mensaje (arquitectura5).
 * No sustituye a `parseMessageRegex` (sigue primero en el pipeline).
 */
export function parseMessageFlexible(text: string): ParsedMovimiento | null {
  const raw = text.trim().normalize('NFC');
  if (!raw) {
    return null;
  }

  const monto = buscarMontoEnTextoCompleto(raw);
  if (monto == null) {
    return null;
  }

  const lower = raw.toLowerCase();
  const tipo = detectTipoFlex(lower);
  if (!tipo) {
    return null;
  }

  let banco = detectBanco(raw);
  let cuentaProducto = detectProducto(raw);

  if (tipo === 'gasto') {
    const desdeEn = /\bdesde\s+(.+?)\s+en\s+/i.exec(raw);
    if (desdeEn) {
      const frag = desdeEn[1].trim();
      if (/\bcuenta\s*rut\b|\brut\b/i.test(frag)) {
        banco = banco ?? 'Banco Estado';
        cuentaProducto = cuentaProducto ?? 'Cuenta RUT';
      } else if (!cuentaProducto) {
        cuentaProducto = frag.replace(/\s+/g, ' ');
      }
    }
  }

  if (tipo === 'ahorro' && banco) {
    const sub = extraerSubcuentaTrasBanco(raw, banco);
    if (sub) {
      cuentaProducto = sub;
    }
  }

  if (tipo === 'ahorro' && banco && !cuentaProducto) {
    cuentaProducto = 'Ahorro';
  }

  if (
    tipo === 'ingreso' &&
    /\bcuenta\s*rut\b|\ben\s+la\s+rut\b|\bmi\s+rut\b/i.test(lower)
  ) {
    cuentaProducto = cuentaProducto ?? 'Cuenta RUT';
    banco = banco ?? 'Banco Estado';
  }

  let categoria = '';
  let descripcion = '';
  let destinoHint: string | null = null;

  if (tipo === 'gasto') {
    const tail = tailTrasEn(raw);
    categoria = tail ? inferCategoriaGasto(tail) : 'otros';
    descripcion =
      tail && (categoria === 'otros' || tail.split(/\s+/).length > 1 || /y\s+|varias/i.test(tail))
        ? tail
        : '';
  } else if (tipo === 'ahorro' && /\binvertí\b|\binverti\b/i.test(raw)) {
    const det = tailTrasEn(raw).replace(/^(de|del|por|para|en)\s+/i, '').trim();
    descripcion = det ? `inversión: ${det}` : 'inversión';
    if (!(banco && cuentaProducto)) {
      destinoHint = det || 'inversión';
    }
  }

  const base: ParsedMovimiento = {
    tipo,
    monto,
    categoria,
    descripcion,
    origen: null,
    destino: destinoHint,
    banco: banco ?? null,
    cuentaProducto: cuentaProducto ?? null,
  };

  return {
    ...base,
    destino: destinoParaRegistro(base),
  };
}
