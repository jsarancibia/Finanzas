import 'dotenv/config';

import { getProcessMessageLlmOptions } from '../config/enableLlm.js';
import { loadReglas } from '../config/loadReglas.js';
import { textoConsejoSiAplica } from '../services/consejoLocal.js';
import {
  textoPedirMontoGastoSiAplica,
} from '../services/parseMessage.js';
import { textoPedirMontoAsignacionSinCuentaSiAplica } from '../services/parseMessageDisponibleSinCuenta.js';
import {
  textoNotaDistribucionDisponibleSiAplica,
  textoPedirMontoTraspasoSiAplica,
} from '../services/parseMessageTraspaso.js';
import {
  registrarMensajeContexto,
  withContextoUsuario,
} from '../services/memoriaContexto.js';
import { tryEjecutarCorreccion } from '../services/ejecutarCorreccion.js';
import { processMessage, type ProcessResult } from '../services/processMessage.js';
import { appendExchangeToChatHistorial } from '../services/chatHistorialDb.js';
import { construirRespuestaAsistente } from '../services/respuestasChat.js';

export interface ChatPostResponse {
  texto: string;
  resultado: ProcessResult;
}

export type HandleChatPostOpciones = {
  /** UUID de sesión del navegador; si falta o es inválido, no se persiste historial (arquitectura9). */
  sessionId?: string | null;
  /** UUID de `auth.users` (JWT). Sin él no se persiste historial (aislamiento por cuenta). arquitectura11 */
  authUserId?: string | null;
  /** Correo del usuario autenticado (JWT); se guarda en BD junto al turno. arquitectura11 */
  authUserEmail?: string | null;
};

/**
 * arquitectura3: consejo local si aplica; si no, regex → Grok → RPC.
 * arquitectura9: opcionalmente persiste turno en `chat_messages`.
 */
export async function handleChatPost(
  mensajeUsuario: string,
  opciones?: HandleChatPostOpciones,
): Promise<ChatPostResponse> {
  return withContextoUsuario(opciones?.authUserId ?? null, async () => {
    const reglas = loadReglas();
    const trim = mensajeUsuario.trim().normalize('NFC');
    const notaDistribucion = textoNotaDistribucionDisponibleSiAplica(trim);
    const pedirMontoTraspaso = textoPedirMontoTraspasoSiAplica(trim);
    const pedirMontoAsignacionSinCuenta = textoPedirMontoAsignacionSinCuentaSiAplica(trim);
    const consejo = textoConsejoSiAplica(trim);
    const pedirMonto = textoPedirMontoGastoSiAplica(trim);
    let resultado: ProcessResult;

    const correccion = await tryEjecutarCorreccion(trim);
    if (correccion) {
      resultado = correccion;
    } else if (notaDistribucion) {
      resultado = { ok: true, kind: 'consejo', texto: notaDistribucion };
    } else if (pedirMontoTraspaso) {
      resultado = { ok: true, kind: 'aclaracion_monto', texto: pedirMontoTraspaso };
    } else if (pedirMontoAsignacionSinCuenta) {
      resultado = { ok: true, kind: 'aclaracion_monto', texto: pedirMontoAsignacionSinCuenta };
    } else if (consejo) {
      resultado = { ok: true, kind: 'consejo', texto: consejo };
    } else if (pedirMonto) {
      resultado = { ok: true, kind: 'aclaracion_monto', texto: pedirMonto };
    } else {
      resultado = await processMessage(trim, {
        authUserId: opciones?.authUserId?.trim() ?? '',
        ...getProcessMessageLlmOptions(),
      });
    }
    const texto = await construirRespuestaAsistente(resultado, reglas);

    registrarMensajeContexto('user', mensajeUsuario);
    registrarMensajeContexto('assistant', texto.replace(/\s+/g, ' ').trim());

    try {
      await appendExchangeToChatHistorial(
        opciones?.sessionId ?? null,
        trim,
        texto,
        opciones?.authUserId ?? null,
        opciones?.authUserEmail ?? null,
      );
    } catch {
      /* persistencia de chat: no afecta respuesta financiera */
    }

    return { texto, resultado };
  });
}
