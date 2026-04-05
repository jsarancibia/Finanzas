export type MovimientoTipo = 'ingreso' | 'gasto' | 'ahorro';

export interface ParsedMovimiento {
  tipo: MovimientoTipo;
  monto: number;
  categoria: string;
  descripcion: string;
  origen: string | null;
  destino: string | null;
}

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

/**
 * Parsing por expresiones regulares (arquitectura: regex + LLM si es necesario).
 * Si no coincide ningún patrón, devuelve null; el llamador puede intentar LLM más adelante.
 */
export function parseMessageRegex(text: string): ParsedMovimiento | null {
  const t = text.trim();
  if (!t) {
    return null;
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
    const cat = (gasto[3] ?? '').trim();
    return {
      tipo: 'gasto',
      monto,
      categoria: cat,
      descripcion: '',
      origen: null,
      destino: null,
    };
  }

  const ahorro =
    /^(ahorra|ahorrar|ahorre)\s+([\d][\d.,]*)(?:\s+en\s+(.+))?$/i.exec(t);
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

  return null;
}
