import {
  buscarMontoEnTextoCompleto,
  extractLeadingMonto,
} from './parseMessage.js';
import { tieneSenalOrigenDineroExistente } from './contextoNoEsIngresoNuevo.js';
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

function tieneVerboAsignacion(t: string): boolean {
  const lower = t.toLowerCase();
  if (/\bdeja(?:r|me|mos)?\b|\bdejá\b|\bdej[eé]\b/.test(lower)) {
    return true;
  }
  if (/\basigna(?:r)?\b/.test(lower)) {
    return true;
  }
  if (/\bpasa(?:r)?\b(?!\s+que\b)/.test(lower)) {
    return true;
  }
  if (/\bmueve(?:r)?\b/.test(lower)) {
    return true;
  }
  if (/\btraspasa(?:r)?\b/.test(lower)) {
    return true;
  }
  if (/\breparte(?:r)?\b/.test(lower)) {
    return true;
  }
  if (/\bsepara(?:r)?\b/.test(lower)) {
    return true;
  }
  if (/\baparta(?:r)?\b/.test(lower)) {
    return true;
  }
  if (/\btengo\b/.test(lower) && tieneSenalOrigenDineroExistente(t)) {
    return true;
  }
  return false;
}

function limpiarColaOrigenEnDestino(frag: string): string {
  return frag
    .replace(/\s+del\s+(?:dinero\s+)?disponible.*$/iu, '')
    .replace(/\s+desde\s+(?:el\s+)?(?:dinero\s+)?disponible.*$/iu, '')
    .replace(/\s+del\s+pendiente.*$/iu, '')
    .trim();
}

/** Fragmento destino tras en / a / al (antes de «para …»). */
function extraerDestinoAsignacion(t: string): string | null {
  const sinParaAsignar = t
    .replace(/\bpara\s+asignar\b/gi, '__par_asignar__')
    .replace(/\bpara\s+repartir\b/gi, '__par_repartir__');
  const sinPara = sinParaAsignar.split(/\s+para\s+/i)[0].trim();
  const res = [
    /\s+a\s+(?:la\s+)?(.+)$/iu,
    /\s+en\s+(?:la\s+)?(.+)$/iu,
    /\s+al\s+(.+)$/iu,
  ];
  for (const re of res) {
    const m = re.exec(sinPara);
    if (m) {
      const frag = limpiarColaOrigenEnDestino(m[1].trim().replace(/[.!?]+$/u, ''));
      if (frag.length > 0) {
        return frag;
      }
    }
  }
  return null;
}

/**
 * «pasa dinero a mercado pago para gastar 5000» / «pasa 5000 a cuenta rut para gastar»:
 * reparto desde pendiente hacia cuenta disponible, no ingreso nuevo (evita `para gastar` → ingreso en flexible).
 */
function parseVerboHaciaCuentaParaGastar(t: string): ParsedAsignacionSinCuenta | null {
  const lower = t.toLowerCase();
  if (!/\bpara\s+gast(?:ar|o)\b/.test(lower)) {
    return null;
  }
  if (!tieneVerboAsignacion(t)) {
    return null;
  }
  const monto = buscarMontoEnTextoCompleto(t);
  if (monto == null || monto <= 0) {
    return null;
  }
  const work = t.replace(/\s+para\s+gast(?:ar|o)\b[\s\S]*$/iu, '').trim();
  if (!work) {
    return null;
  }
  const destRaw = extraerDestinoAsignacion(work);
  if (!destRaw) {
    return null;
  }
  const mapped = mapExtremoTraspaso(destRaw);
  if (!mapped) {
    return null;
  }
  return { monto, banco: mapped.banco, cuentaProducto: mapped.cuenta };
}

/**
 * «de los 300.000 asigna 100.000 a cuenta rut» → monto operación = 100.000 (el de «de los» es solo referencia).
 */
function parseMontoOperacionTrasDeLos(t: string): number | null {
  const m =
    /\bde\s+(?:los|las)\s+(.+?)\s+(?:asigna|asignar|pasa|pasar|deja|dejá|dejar|mueve|mover|traspasa|traspasar|reparte|repartir)\s+(.+)$/iu.exec(
      t.trim(),
    );
  if (!m) {
    return null;
  }
  const operChunk = m[2].trim();
  const ext = extractLeadingMonto(operChunk);
  if (ext && ext.monto > 0) {
    return ext.monto;
  }
  const g = buscarMontoEnTextoCompleto(operChunk);
  return g != null && g > 0 ? g : null;
}

/**
 * «pasa 50 lucas del disponible a efectivo» (monto antes del origen).
 */
function parseMontoAntesDelDisponibleHaciaA(t: string): ParsedAsignacionSinCuenta | null {
  const m =
    /^(.+?)\s+(del\s+dinero\s+disponible|del\s+disponible|desde\s+(?:el\s+)?(?:dinero\s+)?disponible)\s+a\s+(.+)$/iu.exec(
      t.trim(),
    );
  if (!m) {
    return null;
  }
  const left = m[1].trim();
  const right = m[3].trim().split(/\s+para\s+/i)[0].trim().replace(/[.!?]+$/u, '');
  const ext = extractLeadingMonto(left);
  let monto: number | null = ext?.monto ?? null;
  if (monto == null || monto <= 0) {
    monto = buscarMontoEnTextoCompleto(left);
  }
  if (monto == null || monto <= 0) {
    return null;
  }
  const mapped = mapExtremoTraspaso(right);
  if (!mapped) {
    return null;
  }
  return { monto, banco: mapped.banco, cuentaProducto: mapped.cuenta };
}

/**
 * Parser ampliado arquitectura7: origen disponible/pendiente + verbo de reparto + destino.
 * No cubre «deja … disponible … en …» (lo resuelve parseDejarDisponibleEnCuenta).
 */
function parseAsignacionDesdeDisponibleAmplio(raw: string): ParsedAsignacionSinCuenta | null {
  const t = raw.trim().normalize('NFC');
  if (!t || !tieneVerboAsignacion(t)) {
    return null;
  }

  const pasaParaGastar = parseVerboHaciaCuentaParaGastar(t);
  if (pasaParaGastar) {
    return pasaParaGastar;
  }

  const montoDeLos = parseMontoOperacionTrasDeLos(t);
  if (montoDeLos != null) {
    const destRaw = extraerDestinoAsignacion(t);
    if (!destRaw) {
      return null;
    }
    const mapped = mapExtremoTraspaso(destRaw);
    if (!mapped) {
      return null;
    }
    return { monto: montoDeLos, banco: mapped.banco, cuentaProducto: mapped.cuenta };
  }

  const pasa = parseMontoAntesDelDisponibleHaciaA(t);
  if (pasa) {
    return pasa;
  }

  const verboMontoDelA =
    /^(?:asigna|asignar|pasa|pasar|deja|dejá|dejar|mueve|mover|traspasa|traspasar|reparte|repartir)\s+(.+?)\s+(del\s+dinero\s+disponible|del\s+disponible)\s+a\s+(.+)$/iu.exec(
      t.trim(),
    );
  if (verboMontoDelA) {
    const mid = verboMontoDelA[1].trim();
    const right = verboMontoDelA[3].trim().split(/\s+para\s+/i)[0].trim().replace(/[.!?]+$/u, '');
    const ext = extractLeadingMonto(mid);
    let monto: number | null = ext?.monto ?? null;
    if (monto == null || monto <= 0) {
      monto = buscarMontoEnTextoCompleto(mid);
    }
    if (monto != null && monto > 0) {
      const mapped = mapExtremoTraspaso(right);
      if (mapped) {
        return { monto, banco: mapped.banco, cuentaProducto: mapped.cuenta };
      }
    }
  }

  if (!tieneSenalOrigenDineroExistente(t)) {
    return null;
  }

  const monto = buscarMontoEnTextoCompleto(t);
  if (monto == null || monto <= 0) {
    return null;
  }
  const destRaw = extraerDestinoAsignacion(t);
  if (!destRaw) {
    return null;
  }
  const mapped = mapExtremoTraspaso(destRaw);
  if (!mapped) {
    return null;
  }
  return { monto, banco: mapped.banco, cuentaProducto: mapped.cuenta };
}

function parseExplicitPoolAsignacion(raw: string): ParsedAsignacionSinCuenta | null {
  if (!mencionaDisponibleSinCuentaPool(raw)) {
    return null;
  }
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
 * Asignar desde colchón «sin cuenta»: pool explícito, patrones ampliados (arquitectura7) o «deja … disponible … en …».
 */
export function parseAsignarDesdeDisponibleSinCuenta(text: string): ParsedAsignacionSinCuenta | null {
  const raw = text.trim().normalize('NFC');
  if (!raw) {
    return null;
  }

  const explicit = parseExplicitPoolAsignacion(raw);
  if (explicit) {
    return explicit;
  }

  const amplio = parseAsignacionDesdeDisponibleAmplio(raw);
  if (amplio) {
    return amplio;
  }

  return parseDejarDisponibleEnCuenta(raw);
}

const MSG_PEDIR_MONTO_ASIGNACION =
  'Para sacar plata de «disponible sin cuenta» y asignarla a una cuenta, indica el monto y el destino. Ejemplos: «80000 del disponible sin cuenta en cuenta rut», «pasa 5000 a Mercado Pago para gastar», «del dinero disponible deja 130000 en Mercado Libre», «de los 300000 asigna 100000 a cuenta rut», «pasa 50 lucas del disponible a efectivo».';

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
