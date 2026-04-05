import { parseMessageWithLlm } from '../services/parseMessageLlm.js';

/**
 * arquitectura3 — Fase 1: fallback al modelo (p. ej. Grok) solo si falla el parser local.
 * Desactivar: `ENABLE_LLM=false` (o `0`, `no`). Sin `LLM_API_KEY` no hay llamadas HTTP.
 */
export function getProcessMessageLlmOptions(): {
  parseWithLlm?: typeof parseMessageWithLlm;
} {
  const v = process.env.ENABLE_LLM?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') {
    return {};
  }
  return { parseWithLlm: parseMessageWithLlm };
}
