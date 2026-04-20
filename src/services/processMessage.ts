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
import { tryCompletarGastoPendienteConCuenta } from './gastoCompletarRespuestaCuenta.js';
import { resolverGastoCuentaAntesDeRpc } from './gastoRequiereCuenta.js';
import { corregirTypos } from './corregirTypos.js';
import { obtenerSaldosBalancesDesdeBd } from './memoriaContexto.js';

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
  /**
   * Auto-fallback activado (arquitectura14): no había saldo suficiente en el pool
   * y se creó un ingreso directo a la cuenta por el monto faltante.
   */
  fallback_auto?: {
    /** Monto que se tomó del pool «disponible sin cuenta» (0 si el pool estaba vacío). */
    monto_pool: number;
    /** Monto registrado como ingreso directo a la cuenta destino. */
    monto_ingreso: number;
    banco: string;
    cuentaProducto: string;
  };
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

async function rpcAplicarMovimiento(
  parsed: ParsedMovimiento,
  authUserId: string,
): Promise<{
  ok: true;
  movimiento_id: string;
} | { ok: false; error: string; phase: 'rpc' | 'resultado' }> {
  if (!authUserId) {
    return { ok: false, phase: 'rpc', error: 'sin_usuario_autenticado' };
  }
  const pDestino = destinoParaRegistro(parsed);
  const { data, error } = await getSupabaseService().rpc('aplicar_movimiento', {
    p_auth_user_id: authUserId,
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

/** Ingreso directo a cuenta (arquitectura14 fallback). NO pasa por disponible sin cuenta. */
async function rpcIngresoDirectoCuenta(
  monto: number,
  banco: string,
  cuentaProducto: string,
  authUserId: string,
): Promise<{ ok: true; movimiento_id: string } | { ok: false; error: string }> {
  const destino = `${banco} · ${cuentaProducto}`;
  const { data, error } = await getSupabaseService().rpc('aplicar_movimiento', {
    p_auth_user_id: authUserId,
    p_tipo: 'ingreso',
    p_monto: monto,
    p_categoria: 'ingreso_directo',
    p_descripcion: `Ingreso auto a ${destino}`,
    p_origen: '',
    p_destino: destino,
    p_banco: banco,
    p_cuenta_producto: cuentaProducto,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
  if (row?.ok && row.movimiento_id) return { ok: true, movimiento_id: row.movimiento_id };
  return { ok: false, error: (typeof row?.error === 'string' ? row.error : 'rechazado') };
}

async function ejecutarAsignacionDesdeSinCuenta(
  text: string,
  authUserId: string,
): Promise<ProcessResult | null> {
  const asg = parseAsignarDesdeDisponibleSinCuenta(text);
  if (!asg) {
    return null;
  }
  if (!authUserId) {
    return { ok: false, phase: 'rpc', error: 'sin_usuario_autenticado' };
  }

  const parsedBase: ParsedMovimiento = {
    tipo: 'ingreso',
    monto: asg.monto,
    categoria: 'asignacion_sin_cuenta',
    descripcion: 'desde disponible sin cuenta',
    origen: null,
    destino: `${asg.banco} · ${asg.cuentaProducto}`,
    banco: asg.banco,
    cuentaProducto: asg.cuentaProducto,
  };

  const { data, error } = await getSupabaseService().rpc('asignar_desde_disponible_sin_cuenta', {
    p_auth_user_id: authUserId,
    p_monto: asg.monto,
    p_banco: asg.banco,
    p_cuenta_producto: asg.cuentaProducto,
  });

  if (error) {
    return { ok: false, phase: 'rpc', error: error.message, parsed: parsedBase };
  }

  const row = data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
  if (!row || typeof row !== 'object') {
    return { ok: false, phase: 'resultado', error: 'respuesta_vacia', parsed: parsedBase };
  }

  // ── Flujo normal: había saldo suficiente ──
  if (row.ok === true && row.movimiento_id) {
    return {
      ok: true,
      movimiento_id: row.movimiento_id,
      parsed: parsedBase,
      asignacion_desde_sin_cuenta: true,
    };
  }

  const err = typeof row.error === 'string' ? row.error : 'rechazado';

  // ── AUTO-FALLBACK (arquitectura14): saldo insuficiente en el pool ──
  if (err === 'sin_cuenta_insuficiente') {
    const saldos = await obtenerSaldosBalancesDesdeBd();
    const enPool = saldos ? Math.max(0, Math.floor(saldos.saldo_disponible_sin_cuenta)) : 0;
    const montoTotal = asg.monto;

    // Caso B: pool vacío → ingreso directo por el total
    if (enPool <= 0) {
      const res = await rpcIngresoDirectoCuenta(montoTotal, asg.banco, asg.cuentaProducto, authUserId);
      if (!res.ok) {
        return { ok: false, phase: 'resultado', error: res.error, parsed: parsedBase };
      }
      return {
        ok: true,
        movimiento_id: res.movimiento_id,
        parsed: parsedBase,
        fallback_auto: { monto_pool: 0, monto_ingreso: montoTotal, banco: asg.banco, cuentaProducto: asg.cuentaProducto },
      };
    }

    // Caso A: pool parcial → asignar lo que hay + ingreso directo por el resto
    const montoIngreso = montoTotal - enPool;

    // Paso 1: asignar los fondos disponibles del pool
    const r1 = await getSupabaseService().rpc('asignar_desde_disponible_sin_cuenta', {
      p_auth_user_id: authUserId,
      p_monto: enPool,
      p_banco: asg.banco,
      p_cuenta_producto: asg.cuentaProducto,
    });
    if (r1.error) {
      return { ok: false, phase: 'rpc', error: r1.error.message, parsed: parsedBase };
    }
    const rowPool = r1.data as { ok?: boolean; movimiento_id?: string; error?: string } | null;
    if (!rowPool?.ok) {
      // Pool no se pudo usar: fallback total por ingreso directo
      const res = await rpcIngresoDirectoCuenta(montoTotal, asg.banco, asg.cuentaProducto, authUserId);
      if (!res.ok) {
        return { ok: false, phase: 'resultado', error: res.error, parsed: parsedBase };
      }
      return {
        ok: true,
        movimiento_id: res.movimiento_id,
        parsed: parsedBase,
        fallback_auto: { monto_pool: 0, monto_ingreso: montoTotal, banco: asg.banco, cuentaProducto: asg.cuentaProducto },
      };
    }

    // Paso 2: ingreso directo por el monto restante
    const res2 = await rpcIngresoDirectoCuenta(montoIngreso, asg.banco, asg.cuentaProducto, authUserId);
    if (!res2.ok) {
      return { ok: false, phase: 'resultado', error: res2.error, parsed: parsedBase };
    }

    return {
      ok: true,
      movimiento_id: res2.movimiento_id,
      parsed: parsedBase,
      fallback_auto: { monto_pool: enPool, monto_ingreso: montoIngreso, banco: asg.banco, cuentaProducto: asg.cuentaProducto },
    };
  }

  return { ok: false, phase: 'resultado', error: err, parsed: parsedBase };
}

async function ejecutarTraspaso(
  text: string,
  authUserId: string,
): Promise<ProcessResult | null> {
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

  const r1 = await rpcAplicarMovimiento(gastoP, authUserId);
  if (!r1.ok) {
    return {
      ok: false,
      phase: r1.phase,
      error: r1.error,
      parsed: gastoP,
    };
  }

  const r2 = await rpcAplicarMovimiento(ingresoP, authUserId);
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

export type ProcessMessageOptions = {
  /** Obligatorio para RPC y lecturas financieras por usuario (JWT). */
  authUserId: string;
  parseWithLlm?: (text: string) => Promise<ParsedMovimiento | null>;
};

/**
 * Procesa un mensaje: **asignación desde disponible/sin cuenta (arquitectura7) → regex → traspaso → flexible → LLM**.
 * Consejos/saludos van en `handleChatPost` / CLI.
 */
export async function processMessage(
  raw: string,
  options: ProcessMessageOptions,
): Promise<ProcessResult> {
  const text = corregirTypos(raw.trim().normalize('NFC'));
  const authUserId = options.authUserId.trim();

  const asgPrimero = await ejecutarAsignacionDesdeSinCuenta(text, authUserId);
  if (asgPrimero) {
    return asgPrimero;
  }

  const gastoCompletado = tryCompletarGastoPendienteConCuenta(text);
  if (gastoCompletado) {
    const gastoRule = await resolverGastoCuentaAntesDeRpc(gastoCompletado, authUserId);
    if (gastoRule.accion === 'preguntar') {
      return { ok: true, kind: 'aclaracion_monto', texto: gastoRule.texto };
    }
    let parsedG = gastoRule.parsed;
    const vg = validateParsed(parsedG);
    if (vg) {
      return { ok: false, phase: 'parse', error: vg, parsed: parsedG };
    }
    const rpcG = await rpcAplicarMovimiento(parsedG, authUserId);
    if (!rpcG.ok) {
      return {
        ok: false,
        phase: rpcG.phase,
        error: rpcG.error,
        parsed: parsedG,
      };
    }
    return {
      ok: true,
      movimiento_id: rpcG.movimiento_id,
      parsed: parsedG,
    };
  }

  // Traspaso (flujo de 2 RPCs, antes del LLM para no interferir)
  const trRes = await ejecutarTraspaso(text, authUserId);
  if (trRes) {
    return trRes;
  }

  // LLM: intérprete principal de lenguaje natural
  let parsed: ParsedMovimiento | null = options.parseWithLlm
    ? await options.parseWithLlm(text)
    : null;

  // Regex: respaldo de emergencia (LLM offline / sin API key configurada)
  if (!parsed) {
    parsed = parseMessageRegex(text) ?? parseMessageFlexible(text);
  }

  if (!parsed) {
    return { ok: false, phase: 'parse', error: 'no_parseado' };
  }

  parsed = enriquecerBancoYProducto(text, parsed);

  const v = validateParsed(parsed);
  if (v) {
    return { ok: false, phase: 'parse', error: v, parsed };
  }

  const gastoCuenta = await resolverGastoCuentaAntesDeRpc(parsed, authUserId);
  if (gastoCuenta.accion === 'preguntar') {
    return { ok: true, kind: 'aclaracion_monto', texto: gastoCuenta.texto };
  }
  parsed = gastoCuenta.parsed;

  const rpc = await rpcAplicarMovimiento(parsed, authUserId);
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
