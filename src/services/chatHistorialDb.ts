import { getSupabaseService } from './supabaseClient.js';

const UUID_RE =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Límite de mensajes visibles a cargar en la UI (no es contexto del LLM). */
export const CHAT_HISTORY_UI_LIMIT = 20;

export type ChatRolePersistido = 'user' | 'assistant' | 'system';

export type ChatMessageRow = {
  id: string;
  role: ChatRolePersistido;
  message: string;
  created_at: string;
};

export function normalizarSessionIdChat(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const s = String(raw).trim();
  if (!s || s.length > 80) {
    return null;
  }
  if (!UUID_RE.test(s)) {
    return null;
  }
  return s;
}

function textoPersistible(s: string): boolean {
  return s.trim().length > 0;
}

/** Tabla no creada (migración 009 pendiente) o caché de PostgREST sin refrescar. */
function esErrorTablaChatMessagesAusente(err: { message?: string; code?: string } | null | undefined): boolean {
  const code = String(err?.code ?? '').toUpperCase();
  if (code === 'PGRST205' || code === '42P01') {
    return true;
  }
  const msg = String(err?.message ?? '').toLowerCase();
  if (!msg.includes('chat_messages')) {
    return false;
  }
  return (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('no existe') ||
    msg.includes('could not find the table')
  );
}

/**
 * Inserta turno usuario + asistente. Fallos de BD no deben romper el chat: el caller puede ignorar errores.
 */
export async function appendExchangeToChatHistorial(
  sessionId: string | null,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const sid = normalizarSessionIdChat(sessionId);
  if (!sid || !textoPersistible(userMessage) || !textoPersistible(assistantMessage)) {
    return;
  }
  const supabase = getSupabaseService();
  const u = userMessage.trim();
  const a = assistantMessage.trim();
  const { error: e1 } = await supabase.from('chat_messages').insert({
    session_id: sid,
    role: 'user',
    message: u,
    visible: true,
  });
  if (e1) {
    if (esErrorTablaChatMessagesAusente(e1)) {
      return;
    }
    throw new Error(e1.message);
  }
  const { error: e2 } = await supabase.from('chat_messages').insert({
    session_id: sid,
    role: 'assistant',
    message: a,
    visible: true,
  });
  if (e2) {
    if (esErrorTablaChatMessagesAusente(e2)) {
      return;
    }
    throw new Error(e2.message);
  }
}

export async function listChatHistorialVisible(
  sessionId: string | null,
  limit = CHAT_HISTORY_UI_LIMIT,
): Promise<ChatMessageRow[]> {
  const sid = normalizarSessionIdChat(sessionId);
  if (!sid) {
    return [];
  }
  const supabase = getSupabaseService();
  const lim = Math.min(Math.max(1, Math.floor(limit)), 500);
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, message, created_at')
    .eq('session_id', sid)
    .eq('visible', true)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(lim);

  if (error) {
    if (esErrorTablaChatMessagesAusente(error)) {
      return [];
    }
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const out: ChatMessageRow[] = [];
  for (const r of rows) {
    const id = typeof r.id === 'string' ? r.id : '';
    const role = r.role === 'user' || r.role === 'assistant' ? r.role : null;
    const message = typeof r.message === 'string' ? r.message : '';
    const created_at = typeof r.created_at === 'string' ? r.created_at : '';
    if (!id || !role || !message) {
      continue;
    }
    out.push({ id, role, message, created_at });
  }
  out.reverse();
  return out;
}

/** Oculta mensajes de la sesión (no borra movimientos ni finanzas). */
export async function ocultarHistorialChatSession(sessionId: string | null): Promise<void> {
  const sid = normalizarSessionIdChat(sessionId);
  if (!sid) {
    return;
  }
  const supabase = getSupabaseService();
  const { error } = await supabase
    .from('chat_messages')
    .update({ visible: false })
    .eq('session_id', sid)
    .eq('visible', true);

  if (error) {
    if (esErrorTablaChatMessagesAusente(error)) {
      return;
    }
    throw new Error(error.message);
  }
}
