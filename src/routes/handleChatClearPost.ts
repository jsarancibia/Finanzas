import { ocultarHistorialChatSession } from '../services/chatHistorialDb.js';

export type ChatClearPostResponse = {
  ok: true;
};

export async function handleChatClearPost(sessionId: string | null): Promise<ChatClearPostResponse> {
  await ocultarHistorialChatSession(sessionId);
  return { ok: true };
}
