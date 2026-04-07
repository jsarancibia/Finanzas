import { obtenerUltimosMensajesParaContexto } from './memoriaContexto.js';
import { destinoParaRegistro, parseMessageRegex, type ParsedMovimiento } from './parseMessage.js';
import { parseMessageFlexible } from './parseMessageFlexible.js';
import { mapExtremoTraspaso } from './parseMessageTraspaso.js';

function parseSoloGastoDesdeTexto(text: string): ParsedMovimiento | null {
  const r = parseMessageRegex(text);
  if (r?.tipo === 'gasto') {
    return r;
  }
  const f = parseMessageFlexible(text);
  return f?.tipo === 'gasto' ? f : null;
}

function esPedirCuentaGastoAsistente(textoAsistente: string): boolean {
  const t = textoAsistente.toLowerCase().normalize('NFC');
  return (
    t.includes('de cuál descontar') ||
    t.includes('de cual descontar') ||
    t.includes('¿de cuál descontar') ||
    t.includes('varias cuentas con saldo') ||
    t.includes('cuentas con saldo. ¿de')
  );
}

/**
 * Fragmento de cuenta en la respuesta del usuario tras el recordatorio del asistente.
 */
export function extraerSeleccionCuentaGastoUsuario(mensaje: string): string | null {
  const t = mensaje.trim().normalize('NFC');
  if (!t || t.length > 120) {
    return null;
  }
  const lower = t.toLowerCase();
  if (/\b(gasté|gaste|gasto|ahorr|ingres|asign)\b/i.test(lower) && /\d/.test(t)) {
    return null;
  }

  const mDesde = /^\s*(?:desde|descontar\s+desde|descuenta\s+desde)\s+(.+)$/i.exec(t);
  if (mDesde) {
    return mDesde[1].trim().replace(/[.!?]+$/u, '');
  }
  const mDesc = /^\s*descuenta\s+(.+)$/i.exec(t);
  if (mDesc) {
    const inner = mDesc[1].trim().replace(/^desde\s+/i, '');
    return inner.replace(/[.!?]+$/u, '');
  }
  if (/^\s*cuenta\s*rut\b/i.test(t)) {
    return 'cuenta rut';
  }
  if (/^\s*mercado\s*pago\b/i.test(t)) {
    return 'mercado pago';
  }
  if (/^\s*rut\b$/i.test(t)) {
    return 'cuenta rut';
  }
  if (/^\s*mp\b$/i.test(t)) {
    return 'mercado pago';
  }
  if (t.length <= 48 && !/\d{4,}/.test(t)) {
    return t.replace(/[.!?]+$/u, '').trim();
  }
  return null;
}

/**
 * Tras «¿de cuál cuenta?», une el gasto del turno anterior con «cuenta rut» / «desde mp», etc.
 */
export function tryCompletarGastoPendienteConCuenta(mensajeActual: string): ParsedMovimiento | null {
  if (parseSoloGastoDesdeTexto(mensajeActual.trim())) {
    return null;
  }
  const frag = extraerSeleccionCuentaGastoUsuario(mensajeActual);
  if (!frag) {
    return null;
  }
  const mapped = mapExtremoTraspaso(frag);
  if (!mapped) {
    return null;
  }

  const msgs = obtenerUltimosMensajesParaContexto();
  for (let i = msgs.length - 1; i >= 1; i--) {
    if (msgs[i].rol !== 'assistant') {
      continue;
    }
    if (!esPedirCuentaGastoAsistente(msgs[i].texto)) {
      continue;
    }
    if (msgs[i - 1].rol !== 'user') {
      continue;
    }
    const previo = parseSoloGastoDesdeTexto(msgs[i - 1].texto);
    if (!previo || previo.tipo !== 'gasto') {
      continue;
    }
    if (previo.banco?.trim() && previo.cuentaProducto?.trim()) {
      continue;
    }
    const enriched: ParsedMovimiento = {
      ...previo,
      banco: mapped.banco,
      cuentaProducto: mapped.cuenta,
    };
    return { ...enriched, destino: destinoParaRegistro(enriched) };
  }
  return null;
}
