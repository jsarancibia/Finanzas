import 'dotenv/config';

import { getProcessMessageLlmOptions } from '../config/enableLlm.js';
import { loadReglas } from '../config/loadReglas.js';
import { textoConsejoSiAplica } from '../services/consejoLocal.js';
import { textoPedirMontoGastoSiAplica } from '../services/parseMessage.js';
import {
  registrarMensajeContexto,
} from '../services/memoriaContexto.js';
import { processMessage, type ProcessResult } from '../services/processMessage.js';
import { construirRespuestaAsistente } from '../services/respuestasChat.js';

export interface ChatPostResponse {
  texto: string;
  resultado: ProcessResult;
}

/**
 * arquitectura3: consejo local si aplica; si no, regex → Grok → RPC.
 */
export async function handleChatPost(mensajeUsuario: string): Promise<ChatPostResponse> {
  const reglas = loadReglas();
  const trim = mensajeUsuario.trim().normalize('NFC');
  const consejo = textoConsejoSiAplica(trim);
  const pedirMonto = textoPedirMontoGastoSiAplica(trim);
  let resultado: ProcessResult;
  if (consejo) {
    resultado = { ok: true, kind: 'consejo', texto: consejo };
  } else if (pedirMonto) {
    resultado = { ok: true, kind: 'aclaracion_monto', texto: pedirMonto };
  } else {
    resultado = await processMessage(trim, getProcessMessageLlmOptions());
  }
  const texto = await construirRespuestaAsistente(resultado, reglas);

  if (resultado.ok) {
    registrarMensajeContexto('user', mensajeUsuario);
    registrarMensajeContexto('assistant', texto.replace(/\s+/g, ' ').trim());
  }

  return { texto, resultado };
}
