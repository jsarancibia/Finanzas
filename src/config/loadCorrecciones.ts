import fs from 'node:fs';
import path from 'node:path';

export type CorreccionTipoConfig = 'undo' | 'eliminar' | 'corregir_monto';

export interface CorreccionDef {
  tipo: CorreccionTipoConfig;
  variantes: string[];
}

export interface CorreccionesConfig {
  correcciones: CorreccionDef[];
}

function defaultPath(): string {
  return path.join(process.cwd(), 'config', 'correcciones.json');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseConfig(raw: unknown): CorreccionesConfig {
  if (!isRecord(raw)) {
    throw new Error('correcciones: el JSON raíz debe ser un objeto');
  }
  const arr = raw.correcciones;
  if (!Array.isArray(arr)) {
    throw new Error('correcciones: falta array "correcciones"');
  }
  const correcciones: CorreccionDef[] = [];
  for (const item of arr) {
    if (!isRecord(item)) {
      throw new Error('correcciones: cada entrada debe ser un objeto');
    }
    const tipo = item.tipo;
    if (tipo !== 'undo' && tipo !== 'eliminar' && tipo !== 'corregir_monto') {
      throw new Error('correcciones: tipo inválido');
    }
    const variantes = item.variantes;
    if (!Array.isArray(variantes) || variantes.some((v) => typeof v !== 'string')) {
      throw new Error('correcciones: "variantes" debe ser array de strings');
    }
    correcciones.push({
      tipo,
      variantes: variantes.map((s) => String(s).trim()).filter(Boolean),
    });
  }
  return { correcciones };
}

let cache: CorreccionesConfig | null = null;

export function loadCorrecciones(filePath: string = defaultPath()): CorreccionesConfig {
  if (cache !== null) {
    return cache;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const raw = JSON.parse(text) as unknown;
  cache = parseConfig(raw);
  return cache;
}

export function releerCorrecciones(filePath: string = defaultPath()): CorreccionesConfig {
  cache = null;
  return loadCorrecciones(filePath);
}
