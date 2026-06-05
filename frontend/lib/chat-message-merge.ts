export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  backendId?: string;
  role: ChatMessageRole;
  content: string;
  createdAt?: Date;
};

export type ServerChatMessage = {
  id?: string | number | null;
  role?: string | null;
  content?: string | null;
  created_at?: string | null;
};

export function normalizeMessageContentForDedupe(content: string): string {
  return String(content || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[-.,;:!?()[\]{}'"`´]/g, "")
    .trim()
    .toLowerCase();
}

function extractMessageUrls(content: string): string[] {
  return Array.from(String(content || "").matchAll(/https?:\/\/[^\s)]+/gi))
    .map((match) => match[0].replace(/[.,;]+$/, ""));
}

function isLoginStatusDuplicate(a: string, b: string): boolean {
  const left = normalizeMessageContentForDedupe(a);
  const right = normalizeMessageContentForDedupe(b);
  const hasLoginStatus = (value: string) => (
    value.includes("login concluido") ||
    value.includes("entrada concluida") ||
    value.includes("sign in completed") ||
    value.includes("signin completed") ||
    value.includes("login complete")
  );
  const hasConnectedStatus = (value: string) => (
    value.includes("conta conectada") ||
    value.includes("sua conta esta conectada") ||
    value.includes("connected account") ||
    value.includes("account is connected") ||
    value.includes("your account is connected")
  );
  return hasLoginStatus(left) && hasLoginStatus(right) && hasConnectedStatus(left) && hasConnectedStatus(right);
}

export function isDuplicateChatMessage(a: Pick<ChatMessage, "role" | "content">, b: Pick<ChatMessage, "role" | "content">): boolean {
  if (a.role !== b.role) return false;

  const left = normalizeMessageContentForDedupe(a.content);
  const right = normalizeMessageContentForDedupe(b.content);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftUrls = extractMessageUrls(a.content);
  const rightUrls = new Set(extractMessageUrls(b.content));
  if (leftUrls.some((url) => rightUrls.has(url))) return true;

  return isLoginStatusDuplicate(a.content, b.content);
}

function normalizeServerMessage(message: ServerChatMessage): ChatMessage | null {
  const backendId = String(message.id || "").trim();
  const content = String(message.content || "").trim();
  if (!backendId || !content) return null;

  return {
    id: `server-${backendId}`,
    backendId,
    role: message.role === "user" ? "user" : "assistant",
    content,
    createdAt: message.created_at ? new Date(message.created_at) : new Date(),
  };
}

export function mergeChatMessages(
  currentMessages: ChatMessage[],
  serverMessages: ServerChatMessage[],
  options: { removeWelcomeId?: string } = {},
): ChatMessage[] {
  if (!Array.isArray(serverMessages) || serverMessages.length === 0) {
    return currentMessages;
  }

  const removeWelcomeId = options.removeWelcomeId || "";
  const backendIds = new Set(currentMessages.map((message) => message.backendId).filter(Boolean));
  const merged = currentMessages.filter((message) => !removeWelcomeId || message.id !== removeWelcomeId);
  let changed = false;

  for (const rawMessage of serverMessages) {
    const message = normalizeServerMessage(rawMessage);
    if (!message || backendIds.has(message.backendId)) continue;

    const localIndex = merged.findIndex((existing) => !existing.backendId && isDuplicateChatMessage(existing, message));
    if (localIndex >= 0) {
      merged[localIndex] = {
        ...message,
        createdAt: message.createdAt || merged[localIndex].createdAt,
      };
      backendIds.add(message.backendId);
      changed = true;
      continue;
    }

    if (merged.some((existing) => isDuplicateChatMessage(existing, message))) {
      backendIds.add(message.backendId);
      continue;
    }

    merged.push(message);
    backendIds.add(message.backendId);
    changed = true;
  }

  if (!changed) return currentMessages;

  return merged.sort((a, b) => {
    const aTime = a.createdAt?.getTime() || 0;
    const bTime = b.createdAt?.getTime() || 0;
    return aTime - bTime;
  });
}

export function shouldAppendImmediateAssistantMessage(
  currentMessages: ChatMessage[],
  candidate: Pick<ChatMessage, "role" | "content" | "createdAt">,
  submittedAt?: Date,
): boolean {
  if (candidate.role !== "assistant") return true;
  const submittedMs = submittedAt?.getTime() || 0;

  return !currentMessages.some((message) => {
    if (message.role !== "assistant") return false;
    const createdMs = message.createdAt?.getTime() || 0;
    if (submittedMs > 0 && createdMs < submittedMs) return false;
    return isDuplicateChatMessage(message, candidate);
  });
}
