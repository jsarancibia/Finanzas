import 'dotenv/config';

import { loadReglas } from '../config/loadReglas.js';
import {
  registrarMensajeContexto,
} from '../services/memoriaContexto.js';
import { parseMessageWithLlm } from '../services/parseMessageLlm.js';
import { processMessage, type ProcessResult } from '../services/processMessage.js';
import { construirRespuestaAsistente } from '../services/respuestasChat.js';

export interface ChatPostResponse {
  texto: string;
  resultado: ProcessResult;
}

/**
 * Flujo HTTP de chat: reglas + proceso (regex o LLM) + respuesta corta según reglas.
 * Pensado para Vercel u otro servidor Node.
 */
export async function handleChatPost(mensajeUsuario: string): Promise<ChatPostResponse> {
  const reglas = loadReglas();
  const resultado = await processMessage(mensajeUsuario, {
    parseWithLlm: parseMessageWithLlm,
  });
  const texto = await construirRespuestaAsistente(resultado, reglas);

  if (resultado.ok) {
    registrarMensajeContexto('user', mensajeUsuario);
    registrarMensajeContexto('assistant', texto.replace(/\s+/g, ' ').trim());
  }

  return { texto, resultado };
}
