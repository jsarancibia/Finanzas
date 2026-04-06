import type { CorreccionesConfig } from '../config/loadCorrecciones.js';
import {
  buscarMontoEnTextoCompleto,
  extractLeadingMonto,
  parseFragmentoMonto,
} from './parseMessage.js';

export type IntencionCorreccion =
  | { accion: 'revertir'; montoFiltro: number | null }
  | { accion: 'corregir'; montoAnterior: number | null; montoNuevo: number };

function normalizaMsg(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Palabra o frase como criterio de coincidencia. */
function coincideVariante(msgNorm: string, variante: string): boolean {
  const v = normalizaMsg(variante);
  if (!v) {
    return false;
  }
  if (v.includes(' ')) {
    return msgNorm === v || msgNorm.startsWith(`${v} `) || msgNorm.endsWith(` ${v}`) || msgNorm.includes(` ${v} `);
  }
  return new RegExp(`\\b${escapeRe(v)}\\b`, 'i').test(msgNorm);
}

function variantesPorTipo(cfg: CorreccionesConfig, tipo: string): string[] {
  const e = cfg.correcciones.find((c) => c.tipo === tipo);
  return e?.variantes ?? [];
}

/** «no eran 120.000 eran 100.000» / «no eran 120 mil eran 100 mil» */
function intentCorregirDosMontos(text: string): { anterior: number; nuevo: number } | null {
  const t = text.trim().normalize('NFC');
  const re = /\bno\s+eran\s+(.+?)\s+eran\s+(.+)$/iu;
  const m = re.exec(t);
  if (!m) {
    return null;
  }
  const rawA = m[1].trim().replace(/[.!?]+$/u, '').trim();
  const rawB = m[2].trim().replace(/[.!?]+$/u, '').trim();
  const a = parseFragmentoMonto(rawA) ?? buscarMontoEnTextoCompleto(rawA);
  const b = parseFragmentoMonto(rawB) ?? buscarMontoEnTextoCompleto(rawB);
  if (a == null || b == null || a <= 0 || b <= 0) {
    return null;
  }
  return { anterior: a, nuevo: b };
}

/** «corrige a 100.000» / «era 100.000» — solo monto nuevo (último movimiento en BD). */
function intentCorregirUnSoloMonto(text: string): number | null {
  const t = text.trim().normalize('NFC');
  if (/^\s*corrige\s+eso\b/i.test(t) || /^\s*corregir\s+eso\b/i.test(t)) {
    return null;
  }
  if (/^\s*ajusta\s+eso\b/i.test(t) || /^\s*ajustar\s+eso\b/i.test(t)) {
    return null;
  }

  let tail: string | null = null;
  const eraM = /\bera\s+(.+)$/iu.exec(t);
  if (eraM) {
    tail = eraM[1].trim();
  } else {
    const idx = t.search(/\b(corrige|corregir|ajusta|ajustar)\b/iu);
    if (idx >= 0) {
      const sub = t.slice(idx).trim();
      const kw = /^(?:corrige|corregir|ajusta|ajustar)\s+(?:a|al|en)?\s*(.+)$/iu.exec(sub);
      if (kw) {
        tail = kw[1].trim();
      }
    }
  }
  if (!tail) {
    return null;
  }
  const ext = extractLeadingMonto(tail);
  if (ext && ext.monto > 0) {
    return ext.monto;
  }
  const g = buscarMontoEnTextoCompleto(tail);
  return g != null && g > 0 ? g : null;
}

function mensajeEsSoloUndo(msgNorm: string, variantes: string[]): boolean {
  const sorted = [...variantes].sort((a, b) => normalizaMsg(b).length - normalizaMsg(a).length);
  for (const v of sorted) {
    if (coincideVariante(msgNorm, v)) {
      const vn = normalizaMsg(v);
      if (msgNorm === vn) {
        return true;
      }
      if (msgNorm.startsWith(`${vn} `)) {
        const rest = msgNorm.slice(vn.length).trim().replace(/^[.,!?¿¡]+/, '').trim();
        if (rest.length === 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function intentEliminarConMonto(text: string, variantes: string[]): number | null {
  const msgNorm = normalizaMsg(text);
  const sorted = [...variantes].sort((a, b) => normalizaMsg(b).length - normalizaMsg(a).length);
  let matched = false;
  for (const v of sorted) {
    if (coincideVariante(msgNorm, v)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return null;
  }
  const m = buscarMontoEnTextoCompleto(text);
  return m != null && m > 0 ? m : null;
}

/**
 * Parser de correcciones (lenguaje natural). Devuelve null si no aplica.
 */
export function parseIntencionCorreccion(text: string, cfg: CorreccionesConfig): IntencionCorreccion | null {
  const raw = text.trim().normalize('NFC');
  if (!raw) {
    return null;
  }

  const msgNorm = normalizaMsg(raw);

  const dos = intentCorregirDosMontos(raw);
  if (dos) {
    return { accion: 'corregir', montoAnterior: dos.anterior, montoNuevo: dos.nuevo };
  }

  if (/^\s*(corrige|corregir|ajusta|ajustar)\s+eso\b/i.test(raw)) {
    return { accion: 'revertir', montoFiltro: null };
  }

  const vCorregir = variantesPorTipo(cfg, 'corregir_monto');
  const soloNuevo = intentCorregirUnSoloMonto(raw);
  if (soloNuevo != null) {
    const pareceCorregir = vCorregir.some((v) => coincideVariante(msgNorm, v));
    if (pareceCorregir || /^era\s+/i.test(raw.trim())) {
      return { accion: 'corregir', montoAnterior: null, montoNuevo: soloNuevo };
    }
  }

  const vUndo = variantesPorTipo(cfg, 'undo');
  if (mensajeEsSoloUndo(msgNorm, vUndo)) {
    return { accion: 'revertir', montoFiltro: null };
  }

  const vElim = variantesPorTipo(cfg, 'eliminar');
  const montoElim = intentEliminarConMonto(raw, vElim);
  if (montoElim != null) {
    return { accion: 'revertir', montoFiltro: montoElim };
  }
  if (vElim.some((v) => coincideVariante(msgNorm, v))) {
    return { accion: 'revertir', montoFiltro: null };
  }

  return null;
}
