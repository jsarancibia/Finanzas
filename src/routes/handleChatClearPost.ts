import { ocultarHistorialChatSession } from '../services/chatHistorialDb.js';

export type ChatClearPostResponse = {
  ok: true;
};

export async function handleChatClearPost(
  sessionId: string | null,
  authUserId: string | null,
): Promise<ChatClearPostResponse> {
  await ocultarHistorialChatSession(sessionId, authUserId);
  return { ok: true };
}
