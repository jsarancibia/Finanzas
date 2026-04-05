import { loadReglas } from '../config/loadReglas.js';
import {
  MAX_ULTIMOS_MENSAJES,
  obtenerResumenFinancieroOpcional,
  obtenerUltimosMensajesParaContexto,
} from './memoriaContexto.js';

/**
 * OPTIMIZACIÓN DE TOKENS (arquitectura.md):
 * no historial completo; último mensaje + contexto mínimo + resumen BD opcional.
 */

const CAP_CONTEXTO_CORTO = 4;

function contextoRecortado(cap: number): string {
  const todos = obtenerUltimosMensajesParaContexto();
  const slice = todos.slice(-cap);
  if (slice.length === 0) {
    return '';
  }
  return slice.map((m) => `${m.rol}: ${m.texto}`).join('\n');
}

export interface EntradaMinimaParaModelo {
  ultimo_mensaje: string;
  contexto_ligero: string;
  resumen_financiero_bd: string | null;
}

/**
 * Paquete reducido para cuando integres el LLM: sin historial completo.
 */
export async function armarEntradaMinimaParaModelo(
  ultimoMensajeUsuario: string,
): Promise<EntradaMinimaParaModelo> {
  const reglas = loadReglas();
  const cap =
    reglas.respuestas.max_longitud === 'corta' ? CAP_CONTEXTO_CORTO : MAX_ULTIMOS_MENSAJES;

  return {
    ultimo_mensaje: ultimoMensajeUsuario.trim(),
    contexto_ligero: contextoRecortado(cap),
    resumen_financiero_bd: await obtenerResumenFinancieroOpcional(),
  };
}
