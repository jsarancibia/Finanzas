import 'dotenv/config';

import { loadReglas } from './config/loadReglas.js';
import {
  MAX_ULTIMOS_MENSAJES,
  obtenerResumenFinancieroOpcional,
  registrarMensajeContexto,
} from './services/memoriaContexto.js';
import { testSupabaseConnectivity } from './services/supabaseClient.js';
import { parseMessageWithLlm } from './services/parseMessageLlm.js';
import { construirRespuestaAsistente } from './services/respuestasChat.js';
import { processMessage } from './services/processMessage.js';

async function main(): Promise<void> {
  const reglas = loadReglas();
  const mensaje = process.argv[2];

  if (mensaje) {
    const resultado = await processMessage(mensaje, {
      parseWithLlm: parseMessageWithLlm,
    });
    const textoAsistente = await construirRespuestaAsistente(resultado, reglas);
    console.log(textoAsistente);
    if (resultado.ok) {
      registrarMensajeContexto('user', mensaje);
      registrarMensajeContexto(
        'assistant',
        textoAsistente.replace(/\s+/g, ' ').trim(),
      );
    }
    console.log(JSON.stringify(resultado));
    if (!resultado.ok) {
      process.exitCode = 1;
    }
    return;
  }

  try {
    await testSupabaseConnectivity();
    console.log('[Supabase] Conexión verificada correctamente (API REST respondió).');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Supabase] Error al verificar la conexión:', message);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[Reglas] moneda=${reglas.moneda} confirmaciones=${reglas.respuestas.confirmaciones} (config/reglas.json)`,
  );
  console.log(
    `[Memoria] principal=Supabase; contexto ligero=hasta ${MAX_ULTIMOS_MENSAJES} mensajes en proceso; resumen opcional=balances`,
  );

  const resumen = await obtenerResumenFinancieroOpcional();
  if (resumen) {
    console.log(`[Memoria] resumen: ${resumen}`);
  }
}

void main();
