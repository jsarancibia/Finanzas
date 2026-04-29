import type { Reglas } from '../config/loadReglas.js';
import type { ProcessResult } from './processMessage.js';
import { formatoMontoAsistente } from './formatoMoneda.js';
import { obtenerSaldosBalancesDesdeBd } from './memoriaContexto.js';

/**
 * COMPORTAMIENTO DEL CHAT (arquitectura.md): respuestas cortas, confirmación clara, CLP.
 */

function lineaSaldoDisponible(reglas: Reglas, disponible: number): string {
  return `Saldo disponible: ${formatoMontoAsistente(disponible, reglas)}`;
}

function lineaSaldoAhorrado(reglas: Reglas, ahorrado: number): string {
  return `Saldo ahorrado: ${formatoMontoAsistente(ahorrado, reglas)}`;
}

function lineaDisponibleSinCuenta(reglas: Reglas, n: number): string {
  return `Disponible sin cuenta: ${formatoMontoAsistente(n, reglas)}`;
}

/** Mensajes breves sin detalles largos. */
export async function respuestaErrorCorta(
  resultado: ProcessResult,
  reglas: Reglas,
): Promise<string> {
  if (resultado.ok) {
    return '';
  }
  if ('phase' in resultado && resultado.phase === 'resultado') {
    const errCode = typeof resultado.error === 'string' ? resultado.error : '';
    if (
      errCode === 'cuenta_no_encontrada' ||
      errCode === 'banco_no_encontrado'
    ) {
      return 'No encontré esa cuenta de ahorro con ese banco/nombre. Indica igual que en el panel (ej. Mercado Pago y la cuenta «reservas», «fondo mutuo», etc.).';
    }
    if (errCode === 'saldo_insuficiente_cuenta_ahorro') {
      return 'En esa cuenta de ahorro no alcanza el monto que quieres retirar. Revisa el saldo en «Ahorro» o usa un monto menor.';
    }
  }

  if (resultado.phase === 'parse') {
    if (resultado.error === 'no_parseado') {
      return 'No reconocí el mensaje.';
    }
    if (resultado.error === 'monto_invalido') {
      return 'Monto no válido.';
    }
    return 'No pude interpretar eso.';
  }
  if (resultado.phase === 'rpc') {
    const errMsg = typeof resultado.error === 'string' ? resultado.error : '';
    // Mostrar el error de negocio si es descriptivo y no expone datos internos
    const erroresNegocio: Record<string, string> = {
      sin_cuenta_insuficiente: 'No hay saldo suficiente en el pool disponible.',
      saldo_insuficiente: 'Saldo disponible insuficiente para esa operación.',
      cuenta_insuficiente: 'El saldo de la cuenta es insuficiente.',
      ahorro_insuficiente_para_revertir: 'No se puede deshacer: el ahorro actual es menor al monto.',
      sin_movimientos: 'No hay movimientos registrados para operar.',
      sin_movimiento_con_ese_monto: 'No se encontró un movimiento con ese monto.',
      duplicado: 'Ese movimiento ya fue registrado (anti-duplicado).',
      cuenta_no_encontrada: 'La cuenta indicada no existe. Verifica el nombre.',
      banco_no_encontrado: 'El banco indicado no existe. Verifica el nombre.',
      asignacion_datos_invalidos: 'Datos de asignación inválidos. Falta cuenta de destino.',
      monto_invalido: 'El monto ingresado no es válido.',
      tipo_invalido: 'Tipo de movimiento no reconocido.',
    };
    if (errMsg && erroresNegocio[errMsg]) {
      return `No se pudo guardar: ${erroresNegocio[errMsg]}`;
    }
    return 'No se pudo guardar. Revisa la conexión o intenta de nuevo.';
  }
  if (resultado.error === 'duplicado') {
    return 'Ese movimiento ya estaba registrado.';
  }
  if (resultado.error === 'sin_cuenta_insuficiente') {
    return 'En «disponible sin cuenta» no alcanza ese monto. Revisa el saldo del resumen o asigna un monto menor.';
  }
  if (resultado.error === 'sin_movimientos') {
    return 'No hay movimientos para corregir o deshacer.';
  }
  if (resultado.error === 'sin_movimiento_con_ese_monto') {
    return 'No encontré un movimiento reciente con ese monto.';
  }
  if (resultado.error === 'gasto_sin_cuenta_no_reversible') {
    return 'Ese gasto sin cuenta enlazada no se puede deshacer ni corregir automáticamente desde el chat. Ajusta en la base de datos o contacta soporte.';
  }
  if (resultado.error === 'saldo_insuficiente_para_revertir') {
    return 'No se puede deshacer: los saldos actuales no cuadran con esa operación.';
  }
  if (resultado.error === 'ahorro_insuficiente_para_revertir') {
    return 'No se puede deshacer ese ahorro: el saldo ahorrado en la base es menor que el monto del movimiento.';
  }
  if (resultado.error === 'origen_disponible_no_encontrado') {
    return 'No encontré la cuenta disponible de origen (revisa el nombre o crea primero esa cuenta con saldo).';
  }
  if (resultado.error === 'saldo_insuficiente_cuenta_origen') {
    return 'En la cuenta disponible de origen no alcanza ese monto para pasar a ahorro.';
  }
  if (resultado.error === 'origen_igual_destino') {
    return 'Origen y destino no pueden ser la misma cuenta para este movimiento.';
  }
  if (resultado.error === 'saldo_insuficiente') {
    const p = !resultado.ok && 'parsed' in resultado ? resultado.parsed : undefined;
    if (p && (p.tipo === 'ahorro' || p.tipo === 'gasto')) {
      const saldos = await obtenerSaldosBalancesDesdeBd();
      const disp = saldos != null && Number.isFinite(saldos.saldo_disponible)
        ? saldos.saldo_disponible
        : null;
      const pedido = formatoMontoAsistente(p.monto, reglas);
      if (disp != null) {
        const dStr = formatoMontoAsistente(disp, reglas);
        if (p.tipo === 'ahorro') {
          return `No alcanza el saldo disponible para este ahorro (pediste ${pedido}; tienes ${dStr} disponible). En este registro el ahorro descuenta de ese saldo: primero registra un ingreso con el dinero que ya tienes, o indica un monto menor.`;
        }
        return `Saldo disponible insuficiente (pediste ${pedido}; tienes ${dStr}).`;
      }
    }
    return 'Saldo disponible insuficiente.';
  }
  if (resultado.error === 'monto_invalido') {
    return 'Monto no válido.';
  }
  return 'No se pudo completar la operación.';
}

/**
 * Tras un movimiento exitoso: confirmación + saldos desde BD (fuente de verdad).
 */
export async function construirRespuestaAsistente(
  resultado: ProcessResult,
  reglas: Reglas,
): Promise<string> {
  if (!resultado.ok) {
    return await respuestaErrorCorta(resultado, reglas);
  }

  if ('kind' in resultado && resultado.kind === 'correccion') {
    return resultado.mensaje;
  }

  if (!('movimiento_id' in resultado)) {
    return resultado.texto;
  }

  const { parsed } = resultado;
  const m = formatoMontoAsistente(parsed.monto, reglas);
  const saldos = await obtenerSaldosBalancesDesdeBd();

  const usarCheck = reglas.respuestas.confirmaciones;
  const prefijo = usarCheck ? '✔ ' : '';

  let cuerpo: string;
  if (resultado.traspaso_gasto_id && resultado.traspaso_desde && resultado.traspaso_hacia) {
    cuerpo = `${prefijo}Traspaso registrado: ${m}\n${resultado.traspaso_desde} → ${resultado.traspaso_hacia}`;
  } else if (resultado.fallback_auto) {
    // arquitectura14: auto-fallback por saldo insuficiente en el pool
    const fb = resultado.fallback_auto;
    const hacia = `${fb.banco} · ${fb.cuentaProducto}`;
    const mIngreso = formatoMontoAsistente(fb.monto_ingreso, reglas);
    if (fb.monto_pool > 0) {
      const mPool = formatoMontoAsistente(fb.monto_pool, reglas);
      cuerpo = `${prefijo}Se agregaron ${m} a ${hacia}\n(${mPool} desde disponible, ${mIngreso} registrado como ingreso)`;
    } else {
      cuerpo = `${prefijo}Se agregaron ${m} a ${hacia}\n(Sin saldo disponible, se registró como ingreso directo)`;
    }
  } else if (resultado.asignacion_desde_sin_cuenta && parsed.banco && parsed.cuentaProducto) {
    const hacia = `${parsed.banco} · ${parsed.cuentaProducto}`;
    cuerpo = `${prefijo}Asignado ${m} desde disponible sin cuenta a ${hacia}`;
  } else if (parsed.tipo === 'ingreso') {
    let extra = '';
    if (parsed.banco && parsed.cuentaProducto) {
      extra = ` (${parsed.banco} · ${parsed.cuentaProducto})`;
    } else if (parsed.descripcion) {
      extra = ` (${parsed.descripcion})`;
    }
    cuerpo = `${prefijo}Ingreso registrado: ${m}${extra}`;
  } else if (parsed.tipo === 'retiro_cuenta' && parsed.banco && parsed.cuentaProducto) {
    const desde = `${parsed.banco} · ${parsed.cuentaProducto}`;
    cuerpo = `${prefijo}Retiro registrado: ${m} desde ${desde}`;
  } else if (parsed.tipo === 'gasto') {
    const label = (parsed.categoria && parsed.categoria !== 'otros')
      ? parsed.categoria
      : (parsed.descripcion || parsed.categoria || 'otros');
    cuerpo = `${prefijo}Gasto registrado: ${m} (${label})`;
  } else {
    const dest = parsed.destino ? ` (${parsed.destino})` : '';
    cuerpo = `${prefijo}Ahorro registrado: ${m}${dest}`;
  }

  if (!reglas.respuestas.confirmaciones) {
    if (saldos) {
      const out = [cuerpo, lineaSaldoDisponible(reglas, saldos.saldo_disponible)];
      if (resultado.asignacion_desde_sin_cuenta) {
        out.push(lineaDisponibleSinCuenta(reglas, saldos.saldo_disponible_sin_cuenta));
      }
      if (
        parsed.tipo === 'ahorro' ||
        parsed.tipo === 'retiro_cuenta' ||
        (parsed.tipo === 'ingreso' && parsed.banco && parsed.cuentaProducto)
      ) {
        out.push(lineaSaldoAhorrado(reglas, saldos.saldo_ahorrado));
      }
      return out.join('\n');
    }
    return cuerpo;
  }

  if (!saldos) {
    return cuerpo;
  }

  const lineas = [cuerpo, lineaSaldoDisponible(reglas, saldos.saldo_disponible)];
  if (resultado.asignacion_desde_sin_cuenta) {
    lineas.push(lineaDisponibleSinCuenta(reglas, saldos.saldo_disponible_sin_cuenta));
  }
  if (
    parsed.tipo === 'ahorro' ||
    parsed.tipo === 'retiro_cuenta' ||
    (parsed.tipo === 'ingreso' && parsed.banco && parsed.cuentaProducto)
  ) {
    lineas.push(lineaSaldoAhorrado(reglas, saldos.saldo_ahorrado));
  }
  return lineas.join('\n');
}
