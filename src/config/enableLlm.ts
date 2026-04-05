import { parseMessageWithLlm } from '../services/parseMessageLlm.js';

/**
 * Fallback al modelo (p. ej. Grok) **solo** cuando fallan el regex y el parser flexible.
 *
 * - Con `LLM_API_KEY` definida y sin desactivar: se pasa `parseWithLlm` a `processMessage`.
 * - Sin key: no se registra el fallback (evita una llamada async inútil).
 * - Desactivar explícito: `ENABLE_LLM=false` (o `0`, `no`).
 */
export function getProcessMessageLlmOptions(): {
  parseWithLlm?: typeof parseMessageWithLlm;
} {
  const off = process.env.ENABLE_LLM?.trim().toLowerCase();
  if (off === 'false' || off === '0' || off === 'no') {
    return {};
  }
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) {
    return {};
  }
  return { parseWithLlm: parseMessageWithLlm };
}
