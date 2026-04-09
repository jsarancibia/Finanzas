import { listChatHistorialVisible } from '../services/chatHistorialDb.js';

export type ChatHistoryGetResponse = {
  messages: Awaited<ReturnType<typeof listChatHistorialVisible>>;
};

export async function handleChatHistoryGet(
  sessionIdQuery: string | null,
  authUserId: string | null,
): Promise<ChatHistoryGetResponse> {
  const messages = await listChatHistorialVisible(sessionIdQuery, authUserId);
  return { messages };
}
