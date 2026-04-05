import { getSupabaseService } from './supabaseClient.js';
import {
  type ParsedMovimiento,
  parseMessageRegex,
} from './parseMessage.js';

export type ProcessOk = {
  ok: true;
  movimiento_id: string;
  parsed: ParsedMovimiento;
};

export type ProcessErr = {
  ok: false;
  phase: 'parse' | 'rpc' | 'resultado';
  error: string;
  parsed?: ParsedMovimiento;
};

export type ProcessResult = ProcessOk | ProcessErr;

function validateParsed(p: ParsedMovimiento): string | null {
  if (p.monto <= 0 || !Number.isFinite(p.monto)) {
    return 'monto_invalido';
  }
  if (!['ingreso', 'gasto', 'ahorro'].includes(p.tipo)) {
    return 'tipo_invalido';
  }
  return null;
}

/**
 * Procesa un mensaje de usuario: parsing (regex; LLM opcional), validación, RPC transaccional.
 */
export async function processMessage(
  raw: string,
  options?: {
    parseWithLlm?: (text: string) => Promise<ParsedMovimiento | null>;
  },
): Promise<ProcessResult> {
  let parsed: ParsedMovimiento | null = parseMessageRegex(raw);

  if (!parsed && options?.parseWithLlm) {
    parsed = await options.parseWithLlm(raw);
  }

  if (!parsed) {
    return { ok: false, phase: 'parse', error: 'no_parseado' };
  }

  const v = validateParsed(parsed);
  if (v) {
    return { ok: false, phase: 'parse', error: v, parsed };
  }

  const { data, error } = await getSupabaseService().rpc('aplicar_movimiento', {
    p_tipo: parsed.tipo,
    p_monto: parsed.monto,
    p_categoria: parsed.categoria,
    p_descripcion: parsed.descripcion,
    p_origen: parsed.origen ?? '',
    p_destino: parsed.destino ?? '',
  });

  if (error) {
    return {
      ok: false,
      phase: 'rpc',
      error: error.message,
      parsed,
    };
  }

  const row = data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
  if (!row || typeof row !== 'object') {
    return { ok: false, phase: 'resultado', error: 'respuesta_vacia', parsed };
  }

  if (row.ok === true && row.movimiento_id) {
    return {
      ok: true,
      movimiento_id: row.movimiento_id,
      parsed,
    };
  }

  const err = typeof row.error === 'string' ? row.error : 'rechazado';
  return {
    ok: false,
    phase: 'resultado',
    error: err,
    parsed,
  };
}
