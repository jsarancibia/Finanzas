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

/** Mensajes breves sin detalles largos. */
export function respuestaErrorCorta(resultado: ProcessResult): string {
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
  if (resultado.error === 'saldo_insuficiente') {
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
    return respuestaErrorCorta(resultado);
  }

  const { parsed } = resultado;
  const m = formatoMontoAsistente(parsed.monto, reglas);
  const saldos = await obtenerSaldosBalancesDesdeBd();

  const usarCheck = reglas.respuestas.confirmaciones;
  const prefijo = usarCheck ? '✔ ' : '';

  let cuerpo: string;
  if (parsed.tipo === 'ingreso') {
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
      return [cuerpo, lineaSaldoDisponible(reglas, saldos.saldo_disponible)].join('\n');
    }
    return cuerpo;
  }

  if (!saldos) {
    return cuerpo;
  }

  const lineas = [cuerpo, lineaSaldoDisponible(reglas, saldos.saldo_disponible)];
  if (parsed.tipo === 'ahorro') {
    lineas.push(lineaSaldoAhorrado(reglas, saldos.saldo_ahorrado));
  }
  return lineas.join('\n');
}
