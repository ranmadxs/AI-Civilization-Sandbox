export type ChatMessage = {
  id: string;
  sender: string;
  timestamp: number;
  channel: "market" | "diplomacy" | "military" | "general";
  content: string;
  metadata?: Record<string, string>;
};

export type ChatState = {
  messages: ChatMessage[];
};

export function buildInitialChatState(): ChatState {
  return { messages: [] };
}

export function addChatMessage(
  chatState: ChatState,
  sender: string,
  channel: ChatMessage["channel"],
  content: string,
): ChatMessage {
  const message: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sender,
    timestamp: 0,
    channel,
    content,
  };
  chatState.messages.push(message);
  return message;
}

export function broadcastMessage(
  chatState: ChatState,
  sender: string,
  channel: ChatMessage["channel"],
  content: string,
): void {
  addChatMessage(chatState, sender, channel, content);
}
