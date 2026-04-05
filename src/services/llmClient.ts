/**
 * Cliente HTTP para Grok (xAI): `POST {baseUrl}/chat/completions`.
 * Por defecto `https://api.x.ai/v1` y un modelo Grok; sobreescribe con `LLM_BASE_URL` / `LLM_MODEL`.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const baseUrl = (process.env.LLM_BASE_URL ?? 'https://api.x.ai/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL?.trim() || 'grok-3-mini';
  return { apiKey, baseUrl, model };
}

/**
 * Una respuesta de chat; si no hay API key o falla la petición, devuelve null.
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
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ?? null;
  } catch {
    return null;
  }
}
