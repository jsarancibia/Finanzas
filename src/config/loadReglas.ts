import fs from 'node:fs';
import path from 'node:path';

/**
 * Formato del archivo externo de reglas (arquitectura.md — SISTEMA DE REGLAS).
 */
export interface Reglas {
  moneda: string;
  respuestas: {
    max_longitud: string;
    confirmaciones: boolean;
  };
  comportamiento: {
    no_repetir: boolean;
    usar_bd_como_fuente: boolean;
  };
}

function defaultReglasPath(): string {
  return path.join(process.cwd(), 'config', 'reglas.json');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseReglas(raw: unknown): Reglas {
  if (!isRecord(raw)) {
    throw new Error('reglas: el JSON raíz debe ser un objeto');
  }

  if (typeof raw.moneda !== 'string') {
    throw new Error('reglas: falta o es inválido "moneda" (string)');
  }

  if (!isRecord(raw.respuestas)) {
    throw new Error('reglas: falta objeto "respuestas"');
  }
  if (typeof raw.respuestas.max_longitud !== 'string') {
    throw new Error('reglas: respuestas.max_longitud debe ser string');
  }
  if (typeof raw.respuestas.confirmaciones !== 'boolean') {
    throw new Error('reglas: respuestas.confirmaciones debe ser boolean');
  }

  if (!isRecord(raw.comportamiento)) {
    throw new Error('reglas: falta objeto "comportamiento"');
  }
  if (typeof raw.comportamiento.no_repetir !== 'boolean') {
    throw new Error('reglas: comportamiento.no_repetir debe ser boolean');
  }
  if (typeof raw.comportamiento.usar_bd_como_fuente !== 'boolean') {
    throw new Error('reglas: comportamiento.usar_bd_como_fuente debe ser boolean');
  }

  return {
    moneda: raw.moneda,
    respuestas: {
      max_longitud: raw.respuestas.max_longitud,
      confirmaciones: raw.respuestas.confirmaciones,
    },
    comportamiento: {
      no_repetir: raw.comportamiento.no_repetir,
      usar_bd_como_fuente: raw.comportamiento.usar_bd_como_fuente,
    },
  };
}

let cache: Reglas | null = null;

/**
 * Lee `config/reglas.json` (desde el directorio de trabajo del proceso) y valida la forma mínima.
 * Resultado en memoria la primera vez; usar `releerReglas()` para forzar recarga.
 */
export function loadReglas(filePath: string = defaultReglasPath()): Reglas {
  if (cache !== null) {
    return cache;
  }

  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`reglas: no se pudo leer ${filePath}: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`reglas: JSON inválido en ${filePath}`);
  }

  cache = parseReglas(parsed);
  return cache;
}

export function releerReglas(filePath: string = defaultReglasPath()): Reglas {
  cache = null;
  return loadReglas(filePath);
}
