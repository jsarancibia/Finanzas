import { inferCategoriaGasto } from './categoriasMovimiento.js';
import { bloqueaIngresoPorPalabraTengo } from './contextoNoEsIngresoNuevo.js';

export type MovimientoTipo = 'ingreso' | 'gasto' | 'ahorro';

export interface ParsedMovimiento {
  tipo: MovimientoTipo;
  monto: number;
  categoria: string;
  descripcion: string;
  origen: string | null;
  destino: string | null;
  /** Banco canónico (Chile); opcional. Si va con cuentaProducto, el RPC enlaza cuenta_id. */
  banco?: string | null;
  /** Producto o subcuenta (ej. Cuenta RUT, fondo mutuo). */
  cuentaProducto?: string | null;
}

/**
 * Texto de destino coherente con banco/producto para `movimientos.destino` y resúmenes.
 */
export function destinoParaRegistro(p: ParsedMovimiento): string {
  const b = p.banco?.trim();
  const c = p.cuentaProducto?.trim();
  if (b && c) {
    return `${b} · ${c}`;
  }
  const d = p.destino?.trim();
  if (d) {
    return d;
  }
  if (c) {
    return c;
  }
  if (b) {
    return b;
  }
  return '';
}

const LUCA = 1000;

const WORD_TO_INT: Record<string, number> = {
  diez: 10,
  quince: 15,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

/**
 * Interpreta montos tipo CLP: quita separadores de miles (.) y usa coma como decimal si aplica.
 */
export function parseMonto(raw: string): number | null {
  const compact = raw.replace(/\s/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(/\./g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function wordToInt(w: string): number | undefined {
  const k = w.toLowerCase();
  return WORD_TO_INT[k];
}

/**
 * Un fragmento que representa solo el monto (ej. "100 mil", "20k", "cien lucas").
 */
export function parseFragmentoMonto(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) {
    return null;
  }

  let m = /^(\d+(?:[.,]\d+)?)\s*k$/i.exec(t);
  if (m) {
    const n = parseMonto(m[1].replace(/\s/g, ''));
    return n != null ? Math.round(n * LUCA) : null;
  }

  m = /^(\d+(?:[.,]\d+)?)\s+lucas?$/i.exec(t);
  if (m) {
    const n = parseMonto(m[1].replace(/\s/g, ''));
    return n != null ? Math.round(n * LUCA) : null;
  }

  m =
    /^(cien|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|diez|quince|doscientos?|trescientos?|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+lucas?$/i.exec(
      t,
    );
  if (m) {
    const base = wordToInt(m[1]);
    return base !== undefined ? base * LUCA : null;
  }

  m = /^(\d+(?:[.,]\d+)?)\s+mil$/i.exec(t);
  if (m) {
    const rawNum = m[1].replace(/\s/g, '');
    const n = parseMonto(rawNum);
    if (n != null) {
      // "600.000 mil": la cifra ya va en pesos con miles con punto; "mil" sobra.
      if (n >= 1000 && /\.\d{3}\b/.test(rawNum)) {
        return Math.round(n);
      }
      return Math.round(n * LUCA);
    }
  }

  m =
    /^(cien|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|diez|quince|doscientos?|trescientos?|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+mil$/i.exec(
      t,
    );
  if (m) {
    const base = wordToInt(m[1]);
    return base !== undefined ? base * LUCA : null;
  }

  return parseMonto(t.replace(/\s/g, ''));
}

/** Primer monto coloquial al inicio de `rest` y el texto que sigue (p. ej. «en cuenta rut»). */
export function extractLeadingMonto(rest: string): { monto: number; rest: string } | null {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  const max = Math.min(4, words.length);
  for (let n = max; n >= 1; n--) {
    const chunk = words.slice(0, n).join(' ');
    const p = parseFragmentoMonto(chunk);
    if (p != null) {
      return { monto: p, rest: words.slice(n).join(' ').trim() };
    }
  }
  return null;
}

/**
 * Busca un monto coloquial o numérico en cualquier posición del texto (mensajes largos).
 */
export function buscarMontoEnTextoCompleto(text: string): number | null {
  const words = text.trim().normalize('NFC').split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  for (let i = 0; i < words.length; i++) {
    const maxN = Math.min(5, words.length - i);
    for (let n = maxN; n >= 1; n--) {
      const chunk = words.slice(i, i + n).join(' ');
      const p = parseFragmentoMonto(chunk);
      if (p != null) {
        return p;
      }
    }
  }
  return null;
}

function limpiarRestoDetalle(s: string): string {
  return s.replace(/^(de|del|por|para|en)\s+/i, '').trim();
}

/**
 * Parsing por expresiones regulares y montos coloquiales (arquitectura3 — Fase 3).
 */
export function parseMessageRegex(text: string): ParsedMovimiento | null {
  const t = text.trim().normalize('NFC');
  if (!t) {
    return null;
  }

  /** «tengo 600.000», «tengo 80 lucas»… ingreso sin decir «disponible». arquitectura8: no si hay colchón/asignación. */
  if (
    /^tengo\s+/i.test(t) &&
    !bloqueaIngresoPorPalabraTengo(t) &&
    !/\btengo\s+(?:un\s+)?ahorro\b/i.test(t) &&
    !/\btengo\s+ahorrado\b/i.test(t)
  ) {
    const montoTengo = buscarMontoEnTextoCompleto(t);
    if (montoTengo != null && montoTengo > 0) {
      return {
        tipo: 'ingreso',
        monto: montoTengo,
        categoria: '',
        descripcion: '',
        origen: null,
        destino: null,
      };
    }
  }

  const ingreso =
    /^(gané|gane|gano|ganó)\s+([\d][\d.,]*)(?:\s+(.+))?$/i.exec(t);
  if (ingreso) {
    const monto = parseMonto(ingreso[2]);
    if (monto === null) {
      return null;
    }
    const resto = (ingreso[3] ?? '').trim();
    return {
      tipo: 'ingreso',
      monto,
      categoria: '',
      descripcion: resto,
      origen: null,
      destino: null,
    };
  }

  const gasto =
    /^(gasté|gaste|gasto)\s+([\d][\d.,]*)(?:\s+en\s+(.+))?$/i.exec(t);
  if (gasto) {
    const monto = parseMonto(gasto[2]);
    if (monto === null) {
      return null;
    }
    const tail = (gasto[3] ?? '').trim();
    const cat = tail ? inferCategoriaGasto(tail) : 'otros';
    const descripcion =
      tail && (cat === 'otros' || tail.split(/\s+/).length > 1) ? tail : '';
    return {
      tipo: 'gasto',
      monto,
      categoria: cat,
      descripcion,
      origen: null,
      destino: null,
    };
  }

  const ahorro =
    /^(ahorra|ahorraré|ahorrare|ahorrar|ahorre|ahorré)\s+([\d][\d.,]*)(?:\s+en\s+(.+))?$/i.exec(
      t,
    );
  if (ahorro) {
    const monto = parseMonto(ahorro[2]);
    if (monto === null) {
      return null;
    }
    const dest = (ahorro[3] ?? '').trim();
    return {
      tipo: 'ahorro',
      monto,
      categoria: '',
      descripcion: '',
      origen: null,
      destino: dest || null,
    };
  }

  const ahorroAgregar =
    /^(agregaré|agregare|colocaré|colocare)\s+un\s+ahorro\s+de\s+(.+)$/i.exec(t) ||
    /^(agrego\s+un\s+ahorro|agregar\s+un\s+ahorro)\s+de\s+(.+)$/i.exec(t);
  if (ahorroAgregar) {
    const ext = extractLeadingMonto(ahorroAgregar[2].trim());
    if (ext) {
      const dest = limpiarRestoDetalle(ext.rest);
      return {
        tipo: 'ahorro',
        monto: ext.monto,
        categoria: '',
        descripcion: '',
        origen: null,
        destino: dest || null,
      };
    }
  }

  const sueldo =
    /^(recib[ií]|recibi|cobr[eé]|cobre)\s+(?:mi\s+|el\s+)?sueldo\s+de\s+(.+)$/i.exec(t);
  if (sueldo) {
    const ext = extractLeadingMonto(sueldo[2].trim());
    if (ext) {
      return {
        tipo: 'ingreso',
        monto: ext.monto,
        categoria: '',
        descripcion: 'sueldo',
        origen: null,
        destino: null,
      };
    }
  }

  const ingCol =
    /^(me\s+)?(pagaron|depositaron|llegaron|llegó)\s+(.+)$/i.exec(t);
  if (ingCol) {
    const tail = ingCol[3].trim();
    let ext = extractLeadingMonto(tail);
    if (!ext) {
      const mGlobal = buscarMontoEnTextoCompleto(t);
      if (mGlobal != null && mGlobal > 0) {
        ext = { monto: mGlobal, rest: tail };
      }
    }
    if (ext) {
      const det = limpiarRestoDetalle(ext.rest);
      return {
        tipo: 'ingreso',
        monto: ext.monto,
        categoria: '',
        descripcion: det,
        origen: null,
        destino: null,
      };
    }
  }

  const saque =
    /^(saqué|saque)\s+(.+)$/i.exec(t);
  if (saque) {
    const ext = extractLeadingMonto(saque[2]);
    if (ext) {
      const det = limpiarRestoDetalle(ext.rest) || 'retiro';
      const cat = inferCategoriaGasto(det);
      return {
        tipo: 'gasto',
        monto: ext.monto,
        categoria: cat,
        descripcion: det,
        origen: null,
        destino: null,
      };
    }
  }

  const guard =
    /^(guardé|guarde|guard[oó]|dejé|deje|dej[oó]|aparté|aparte|apart[oó]|metí|meti)\s+(.+)$/i.exec(
      t,
    );
  if (guard) {
    const rest = guard[2].trim();
    const enAhorro = /\s+en\s+ahorro\b/i.test(rest);
    const ext = extractLeadingMonto(
      rest.replace(/\s+en\s+ahorro\b.*$/i, '').trim() || rest,
    );
    if (ext) {
      let destino: string | null = null;
      const after = limpiarRestoDetalle(ext.rest);
      if (enAhorro) {
        destino = after || 'ahorro';
      } else if (after) {
        destino = after;
      }
      return {
        tipo: 'ahorro',
        monto: ext.monto,
        categoria: '',
        descripcion: '',
        origen: null,
        destino,
      };
    }
  }

  const gastoColoquial =
    /^(gasté|gaste)\s+(.+)$/i.exec(t);
  if (gastoColoquial) {
    const rest = gastoColoquial[2].trim();
    const en = /\s+en\s+(.+)$/i.exec(rest);
    const head = en ? rest.slice(0, en.index).trim() : rest;
    const ext = extractLeadingMonto(head);
    if (ext) {
      const tail = en ? en[1].trim() : limpiarRestoDetalle(ext.rest);
      const combined = tail || ext.rest;
      const cat = combined ? inferCategoriaGasto(combined) : 'otros';
      const descripcion =
        combined &&
        (cat === 'otros' || /y\s+|varias/i.test(combined) || combined.split(/\s+/).length > 1)
          ? combined
          : '';
      return {
        tipo: 'gasto',
        monto: ext.monto,
        categoria: cat,
        descripcion,
        origen: null,
        destino: null,
      };
    }
  }

  const invert =
    /^(invert[ií]|inverti)\s+(.+)$/i.exec(t);
  if (invert) {
    const ext = extractLeadingMonto(invert[2].trim());
    if (ext) {
      const det = limpiarRestoDetalle(ext.rest);
      return {
        tipo: 'ahorro',
        monto: ext.monto,
        categoria: '',
        descripcion: det ? `inversión: ${det}` : 'inversión',
        origen: null,
        destino: det || null,
      };
    }
  }

  return null;
}

const MSG_PEDIR_MONTO_GASTO =
  '¿Cuánto gastaste? Escribe el monto en pesos (por ejemplo 15000) y, si quieres, repite el detalle (ej. «gasté 15000 en comida y transporte») para registrarlo como gasto.';

/**
 * «gasté en comida y transporte» sin cifra: invita a indicar el monto (sin RPC ni inventar montos).
 */
export function textoPedirMontoGastoSiAplica(text: string): string | null {
  const t = text.trim().normalize('NFC');
  const m = /^(gasté|gaste)\s+(.+)$/i.exec(t);
  if (!m) {
    return null;
  }
  const rest = m[2].trim();
  if (extractLeadingMonto(rest) !== null) {
    return null;
  }
  if (/^en\s+/i.test(rest) || /\s+en\s+/i.test(rest)) {
    return MSG_PEDIR_MONTO_GASTO;
  }
  return null;
}
