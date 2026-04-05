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
    return 'No se pudo guardar. Revisa conexión o permisos.';
  }
  if (resultado.error === 'duplicado') {
    return 'Ese movimiento ya estaba registrado.';
  }
  if (resultado.error === 'sin_cuenta_insuficiente') {
    return 'En «disponible sin cuenta» no alcanza ese monto. Revisa el saldo del resumen o asigna un monto menor.';
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
  } else if (resultado.asignacion_desde_sin_cuenta && parsed.banco && parsed.cuentaProducto) {
    const hacia = `${parsed.banco} · ${parsed.cuentaProducto}`;
    cuerpo = `${prefijo}Asignado ${m} desde disponible sin cuenta a ${hacia}`;
  } else if (parsed.tipo === 'ingreso') {
    const extra = parsed.descripcion ? ` (${parsed.descripcion})` : '';
    cuerpo = `${prefijo}Ingreso registrado: ${m}${extra}`;
  } else if (parsed.tipo === 'gasto') {
    const cat = parsed.categoria ? ` (${parsed.categoria})` : '';
    cuerpo = `${prefijo}Gasto registrado: ${m}${cat}`;
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
  if (parsed.tipo === 'ahorro') {
    lineas.push(lineaSaldoAhorrado(reglas, saldos.saldo_ahorrado));
  }
  return lineas.join('\n');
}
