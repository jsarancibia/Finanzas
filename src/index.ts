import 'dotenv/config';

import { getProcessMessageLlmOptions } from './config/enableLlm.js';
import { loadReglas } from './config/loadReglas.js';
import {
  MAX_ULTIMOS_MENSAJES,
  obtenerResumenFinancieroOpcional,
  registrarMensajeContexto,
  withContextoUsuario,
} from './services/memoriaContexto.js';
import { testSupabaseConnectivity } from './services/supabaseClient.js';
import { textoConsejoSiAplica } from './services/consejoLocal.js';
import { textoPedirMontoGastoSiAplica } from './services/parseMessage.js';
import { textoPedirMontoAsignacionSinCuentaSiAplica } from './services/parseMessageDisponibleSinCuenta.js';
import {
  textoNotaDistribucionDisponibleSiAplica,
  textoPedirMontoTraspasoSiAplica,
} from './services/parseMessageTraspaso.js';
import { tryEjecutarCorreccion } from './services/ejecutarCorreccion.js';
import { construirRespuestaAsistente } from './services/respuestasChat.js';
import { processMessage, type ProcessResult } from './services/processMessage.js';

async function main(): Promise<void> {
  const reglas = loadReglas();
  const mensaje = process.argv[2];

  if (mensaje) {
    const cliUid = process.env.FINANZAS_AUTH_USER_ID?.trim() ?? '';
    await withContextoUsuario(cliUid || null, async () => {
      const trim = mensaje.trim().normalize('NFC');
      const notaDistribucion = textoNotaDistribucionDisponibleSiAplica(trim);
      const pedirMontoTraspaso = textoPedirMontoTraspasoSiAplica(trim);
      const pedirMontoAsignacionSinCuenta = textoPedirMontoAsignacionSinCuentaSiAplica(trim);
      const consejo = textoConsejoSiAplica(trim);
      const pedirMonto = textoPedirMontoGastoSiAplica(trim);
      const correccion = await tryEjecutarCorreccion(trim);
      let resultado: ProcessResult;
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
          authUserId: cliUid,
          ...getProcessMessageLlmOptions(),
        });
      }
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
    });
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
