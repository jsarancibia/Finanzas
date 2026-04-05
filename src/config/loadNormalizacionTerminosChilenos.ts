import fs from 'node:fs';
import path from 'node:path';

import type { MovimientoTipo } from '../services/parseMessage.js';

export interface TerminoChilenoGrupo {
  variantes: string[];
  canonico: string;
  tipo: MovimientoTipo;
}

export interface NormalizacionTerminosChilenos {
  terminos: TerminoChilenoGrupo[];
}

function defaultPath(): string {
  return path.join(process.cwd(), 'config', 'normalizacion_terminos_chilenos.json');
}

function isMovimientoTipo(v: string): v is MovimientoTipo {
  return v === 'ingreso' || v === 'gasto' || v === 'ahorro';
}

function parseNormalizacion(raw: unknown): NormalizacionTerminosChilenos {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('normalizacion_terminos_chilenos: la raíz debe ser un objeto');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.terminos)) {
    throw new Error('normalizacion_terminos_chilenos: falta el array "terminos"');
  }
  const terminos: TerminoChilenoGrupo[] = [];
  for (let i = 0; i < r.terminos.length; i++) {
    const row = r.terminos[i];
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`normalizacion_terminos_chilenos: terminos[${i}] debe ser objeto`);
    }
    const o = row as Record<string, unknown>;
    if (!Array.isArray(o.variantes) || o.variantes.some((x) => typeof x !== 'string')) {
      throw new Error(`normalizacion_terminos_chilenos: terminos[${i}].variantes debe ser string[]`);
    }
    if (typeof o.canonico !== 'string' || !o.canonico.trim()) {
      throw new Error(`normalizacion_terminos_chilenos: terminos[${i}].canonico inválido`);
    }
    const tipo = typeof o.tipo === 'string' ? o.tipo.trim().toLowerCase() : '';
    if (!isMovimientoTipo(tipo)) {
      throw new Error(
        `normalizacion_terminos_chilenos: terminos[${i}].tipo debe ser ingreso|gasto|ahorro`,
      );
    }
    terminos.push({
      variantes: o.variantes.map((s) => s.trim()).filter(Boolean),
      canonico: o.canonico.trim(),
      tipo,
    });
  }
  return { terminos };
}

let cacheData: NormalizacionTerminosChilenos | null = null;
let cachePairs: { v: string; tipo: MovimientoTipo }[] | null = null;
let cachePrefixRe: RegExp | null = null;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPairs(data: NormalizacionTerminosChilenos): { v: string; tipo: MovimientoTipo }[] {
  const pairs: { v: string; tipo: MovimientoTipo }[] = [];
  for (const t of data.terminos) {
    for (const raw of t.variantes) {
      const v = raw.trim().toLowerCase();
      if (v) {
        pairs.push({ v, tipo: t.tipo });
      }
    }
  }
  pairs.sort((a, b) => b.v.length - a.v.length);
  return pairs;
}

function variantToStartFragment(v: string): string {
  const w = v.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length === 0) {
    return '(?!.)';
  }
  const esc = w.map(escapeRegExp).join('\\s+');
  if (w.length === 1) {
    return `${esc}\\b`;
  }
  return esc;
}

function buildPrefixRegex(data: NormalizacionTerminosChilenos): RegExp {
  const seen = new Set<string>();
  const allV: string[] = [];
  for (const t of data.terminos) {
    for (const raw of t.variantes) {
      const v = raw.trim().toLowerCase();
      if (!v || seen.has(v)) {
        continue;
      }
      seen.add(v);
      allV.push(v);
    }
  }
  allV.sort((a, b) => b.length - a.length);
  const frags = allV.map(variantToStartFragment).filter((f) => f !== '(?!.)');
  if (frags.length === 0) {
    return /^$/u;
  }
  return new RegExp(`^(?:${frags.join('|')})`, 'iu');
}

/**
 * Lee `config/normalizacion_terminos_chilenos.json` (cwd del proceso).
 * Si no existe el archivo, devuelve `{ terminos: [] }` sin fallar.
 */
export function loadNormalizacionTerminosChilenos(
  filePath: string = defaultPath(),
): NormalizacionTerminosChilenos {
  if (cacheData !== null) {
    return cacheData;
  }

  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      cacheData = { terminos: [] };
      return cacheData;
    }
    throw new Error(
      `normalizacion_terminos_chilenos: no se pudo leer ${filePath}: ${err.message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`normalizacion_terminos_chilenos: JSON inválido en ${filePath}`);
  }

  cacheData = parseNormalizacion(parsed);
  return cacheData;
}

export function releerNormalizacionTerminosChilenos(
  filePath: string = defaultPath(),
): NormalizacionTerminosChilenos {
  cacheData = null;
  cachePairs = null;
  cachePrefixRe = null;
  return loadNormalizacionTerminosChilenos(filePath);
}

function matchesVariant(lower: string, v: string): boolean {
  const parts = v.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  const esc = parts.map(escapeRegExp).join('\\s+');
  if (parts.length === 1) {
    return new RegExp(`\\b${esc}\\b`, 'iu').test(lower);
  }
  return new RegExp(`(?:^|[\\s,;¡!¿?])${esc}(?:$|[\\s,;¡!¿?]|\\b)`, 'iu').test(lower);
}

/**
 * Infiere tipo de movimiento por variantes del JSON (la variante más larga que coincida gana).
 * Usar después de reglas explícitas en el parser flexible.
 */
export function inferirTipoPorTerminosChilenos(lower: string): MovimientoTipo | null {
  if (cachePairs === null) {
    cachePairs = buildPairs(loadNormalizacionTerminosChilenos());
  }
  for (const { v, tipo } of cachePairs) {
    if (matchesVariant(lower, v)) {
      return tipo;
    }
  }
  return null;
}

/**
 * ¿El mensaje podría ser un registro? (prefijo al inicio, para no confundir con consejos genéricos).
 */
export function parecePrefijoMovimientoDesdeTerminos(trim: string): boolean {
  if (cachePrefixRe === null) {
    cachePrefixRe = buildPrefixRegex(loadNormalizacionTerminosChilenos());
  }
  return cachePrefixRe.test(trim.trim());
}
