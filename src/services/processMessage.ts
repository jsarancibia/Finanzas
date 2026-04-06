import { getSupabaseService } from './supabaseClient.js';
import {
  type ParsedMovimiento,
  destinoParaRegistro,
  parseMessageRegex,
} from './parseMessage.js';
import {
  enriquecerBancoYProducto,
  parseMessageFlexible,
} from './parseMessageFlexible.js';
import { parseAsignarDesdeDisponibleSinCuenta } from './parseMessageDisponibleSinCuenta.js';
import {
  parseTraspaso,
  parsedMovimientoGastoTraspaso,
  parsedMovimientoIngresoTraspaso,
} from './parseMessageTraspaso.js';

export type ProcessOk = {
  ok: true;
  movimiento_id: string;
  parsed: ParsedMovimiento;
  /** Id del gasto asociado cuando `parsed` es el ingreso de un traspaso entre cuentas. */
  traspaso_gasto_id?: string;
  traspaso_desde?: string;
  traspaso_hacia?: string;
  /** Ingreso por asignación desde el colchón «disponible sin cuenta». */
  asignacion_desde_sin_cuenta?: boolean;
};

/** Respuesta solo texto: consejo, pedir monto, etc. Sin movimiento ni RPC. */
export type ProcessTextoSinMovimiento = {
  ok: true;
  kind: 'consejo' | 'aclaracion_monto';
  texto: string;
};

export type ProcessErr = {
  ok: false;
  phase: 'parse' | 'rpc' | 'resultado';
  error: string;
  parsed?: ParsedMovimiento;
};

/** Undo / eliminar movimiento o corregir monto (parser de correcciones). */
export type ProcessCorreccionOk = {
  ok: true;
  kind: 'correccion';
  mensaje: string;
};

export type ProcessResult = ProcessOk | ProcessErr | ProcessTextoSinMovimiento | ProcessCorreccionOk;

function validateParsed(p: ParsedMovimiento): string | null {
  if (p.monto <= 0 || !Number.isFinite(p.monto)) {
    return 'monto_invalido';
  }
  if (!['ingreso', 'gasto', 'ahorro'].includes(p.tipo)) {
    return 'tipo_invalido';
  }
  return null;
}

async function rpcAplicarMovimiento(parsed: ParsedMovimiento): Promise<{
  ok: true;
  movimiento_id: string;
} | { ok: false; error: string; phase: 'rpc' | 'resultado' }> {
  const pDestino = destinoParaRegistro(parsed);
  const { data, error } = await getSupabaseService().rpc('aplicar_movimiento', {
    p_tipo: parsed.tipo,
    p_monto: parsed.monto,
    p_categoria: parsed.categoria,
    p_descripcion: parsed.descripcion,
    p_origen: parsed.origen ?? '',
    p_destino: pDestino,
    p_banco: (parsed.banco ?? '').trim(),
    p_cuenta_producto: (parsed.cuentaProducto ?? '').trim(),
  });

  if (error) {
    return { ok: false, phase: 'rpc', error: error.message };
  }

  const row = data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
  if (!row || typeof row !== 'object') {
    return { ok: false, phase: 'resultado', error: 'respuesta_vacia' };
  }

  if (row.ok === true && row.movimiento_id) {
    return { ok: true, movimiento_id: row.movimiento_id };
  }

  const err = typeof row.error === 'string' ? row.error : 'rechazado';
  return { ok: false, phase: 'resultado', error: err };
}

async function ejecutarAsignacionDesdeSinCuenta(text: string): Promise<ProcessResult | null> {
  const asg = parseAsignarDesdeDisponibleSinCuenta(text);
  if (!asg) {
    return null;
  }
  const { data, error } = await getSupabaseService().rpc('asignar_desde_disponible_sin_cuenta', {
    p_monto: asg.monto,
    p_banco: asg.banco,
    p_cuenta_producto: asg.cuentaProducto,
  });

  if (error) {
    return {
      ok: false,
      phase: 'rpc',
      error: error.message,
      parsed: {
        tipo: 'ingreso',
        monto: asg.monto,
        categoria: 'asignacion_sin_cuenta',
        descripcion: 'desde disponible sin cuenta',
        origen: null,
        destino: `${asg.banco} · ${asg.cuentaProducto}`,
        banco: asg.banco,
        cuentaProducto: asg.cuentaProducto,
      },
    };
  }

  const row = data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
  if (!row || typeof row !== 'object') {
    return {
      ok: false,
      phase: 'resultado',
      error: 'respuesta_vacia',
      parsed: {
        tipo: 'ingreso',
        monto: asg.monto,
        categoria: 'asignacion_sin_cuenta',
        descripcion: 'desde disponible sin cuenta',
        origen: null,
        destino: `${asg.banco} · ${asg.cuentaProducto}`,
        banco: asg.banco,
        cuentaProducto: asg.cuentaProducto,
      },
    };
  }

  if (row.ok === true && row.movimiento_id) {
    return {
      ok: true,
      movimiento_id: row.movimiento_id,
      parsed: {
        tipo: 'ingreso',
        monto: asg.monto,
        categoria: 'asignacion_sin_cuenta',
        descripcion: 'desde disponible sin cuenta',
        origen: null,
        destino: `${asg.banco} · ${asg.cuentaProducto}`,
        banco: asg.banco,
        cuentaProducto: asg.cuentaProducto,
      },
      asignacion_desde_sin_cuenta: true,
    };
  }

  const err = typeof row.error === 'string' ? row.error : 'rechazado';
  return {
    ok: false,
    phase: 'resultado',
    error: err,
    parsed: {
      tipo: 'ingreso',
      monto: asg.monto,
      categoria: 'asignacion_sin_cuenta',
      descripcion: 'desde disponible sin cuenta',
      origen: null,
      destino: `${asg.banco} · ${asg.cuentaProducto}`,
      banco: asg.banco,
      cuentaProducto: asg.cuentaProducto,
    },
  };
}

async function ejecutarTraspaso(text: string): Promise<ProcessResult | null> {
  const tr = parseTraspaso(text);
  if (!tr) {
    return null;
  }
  const gastoP = parsedMovimientoGastoTraspaso(tr);
  const ingresoP = parsedMovimientoIngresoTraspaso(tr);

  const v1 = validateParsed(gastoP);
  if (v1) {
    return { ok: false, phase: 'parse', error: v1, parsed: gastoP };
  }
  const v2 = validateParsed(ingresoP);
  if (v2) {
    return { ok: false, phase: 'parse', error: v2, parsed: ingresoP };
  }

  const r1 = await rpcAplicarMovimiento(gastoP);
  if (!r1.ok) {
    return {
      ok: false,
      phase: r1.phase,
      error: r1.error,
      parsed: gastoP,
    };
  }

  const r2 = await rpcAplicarMovimiento(ingresoP);
  if (!r2.ok) {
    return {
      ok: false,
      phase: r2.phase,
      error: r2.error,
      parsed: ingresoP,
    };
  }

  return {
    ok: true,
    movimiento_id: r2.movimiento_id,
    parsed: ingresoP,
    traspaso_gasto_id: r1.movimiento_id,
    traspaso_desde: destinoParaRegistro(gastoP),
    traspaso_hacia: destinoParaRegistro(ingresoP),
  };
}

/**
 * Procesa un mensaje: **asignación desde disponible/sin cuenta (arquitectura7) → regex → traspaso → flexible → LLM**.
 * Consejos/saludos van en `handleChatPost` / CLI.
 */
export async function processMessage(
  raw: string,
  options?: {
    parseWithLlm?: (text: string) => Promise<ParsedMovimiento | null>;
  },
): Promise<ProcessResult> {
  const text = raw.trim().normalize('NFC');

  const asgPrimero = await ejecutarAsignacionDesdeSinCuenta(text);
  if (asgPrimero) {
    return asgPrimero;
  }

  let parsed: ParsedMovimiento | null = parseMessageRegex(text);

  if (!parsed) {
    const trRes = await ejecutarTraspaso(text);
    if (trRes) {
      return trRes;
    }
    parsed = parseMessageFlexible(text);
  }

  if (!parsed && options?.parseWithLlm) {
    parsed = await options.parseWithLlm(text);
  }

  if (!parsed) {
    return { ok: false, phase: 'parse', error: 'no_parseado' };
  }

  parsed = enriquecerBancoYProducto(text, parsed);

  const v = validateParsed(parsed);
  if (v) {
    return { ok: false, phase: 'parse', error: v, parsed };
  }

  const rpc = await rpcAplicarMovimiento(parsed);
  if (!rpc.ok) {
    return {
      ok: false,
      phase: rpc.phase,
      error: rpc.error,
      parsed,
    };
  }

  return {
    ok: true,
    movimiento_id: rpc.movimiento_id,
    parsed,
  };
}
