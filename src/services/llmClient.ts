/**
 * Cliente HTTP OpenAI-compatible: Groq (gsk_…) o xAI Grok (xai-…).
 * Respeta LLM_BASE_URL y LLM_MODEL si están definidos en .env;
 * de lo contrario, auto-detecta el proveedor por el prefijo de la key.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Activa logs extra con LLM_DEBUG=true */
const DEBUG = process.env.LLM_DEBUG?.trim().toLowerCase() === 'true';

interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Configuración cacheada: las variables de entorno no cambian en tiempo de ejecución. */
let _cfg: LlmConfig | null | undefined;

function getConfig(): LlmConfig | null {
  if (_cfg !== undefined) {
    return _cfg;
  }
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    _cfg = null;
    return null;
  }
  // Auto-detectar proveedor si no hay URL explícita
  const isGroq = apiKey.startsWith('gsk_');
  const defaultUrl = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1';
  const defaultModel = isGroq ? 'llama-3.1-8b-instant' : 'grok-3-mini';
  const baseUrl = (process.env.LLM_BASE_URL ?? defaultUrl).replace(/\/$/, '');
  const model = process.env.LLM_MODEL?.trim() || defaultModel;

  console.log(`[LLM] configurado: ${isGroq ? 'Groq' : 'xAI'} | model=${model}`);
  _cfg = { apiKey, baseUrl, model };
  return _cfg;
}

/**
 * Envía mensajes al endpoint de chat completions.
 * Devuelve el texto de la respuesta, o null si hay error o sin key.
 */
export async function completarChat(
  messages: ChatMessage[],
  options?: { jsonMode?: boolean; maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) {
    return null;
  }

  const temp =
    typeof options?.temperature === 'number' && options.temperature >= 0 && options.temperature <= 2
      ? options.temperature
      : 0.2;

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: temp,
  };

  const cap = options?.maxTokens;
  if (typeof cap === 'number' && cap > 0) {
    body.max_tokens = cap;
  }

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (DEBUG) {
    console.log('[LLM] request body:', JSON.stringify(body).slice(0, 300));
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[LLM] HTTP ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ?? null;
  } catch (err) {
    console.error('[LLM] error de red:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
