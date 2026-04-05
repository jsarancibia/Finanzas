/**
 * Cliente mínimo compatible con API tipo OpenAI (Chat Completions).
 * Sirve para OpenAI, proxies y proveedores con el mismo esquema (p. ej. algunos despliegues de Grok).
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
  const baseUrl = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

/**
 * Una respuesta de chat; si no hay API key o falla la petición, devuelve null.
 */
export async function completarChat(
  messages: ChatMessage[],
  options?: { jsonMode?: boolean },
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) {
    return null;
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: 0.2,
  };

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
