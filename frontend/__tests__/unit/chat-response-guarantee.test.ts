import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("web chat response guarantee", () => {
  it("does not suppress repeated assistant replies from older turns", () => {
    const chatText = source("components/chat/chat-window.tsx");
    const mergeText = source("lib/chat-message-merge.ts");

    expect(chatText).toContain("shouldAppendImmediateAssistantMessage(prev, botMessage, userMessage.createdAt)");
    expect(chatText).not.toContain("const alreadyRendered = prev.some");
    expect(mergeText).toContain("export function shouldAppendImmediateAssistantMessage");
    expect(mergeText).toContain("if (submittedMs > 0 && createdMs < submittedMs) return false;");
  });

  it("times out chat sends and coerces malformed backend payloads into visible text", () => {
    const chatText = source("components/chat/chat-window.tsx");
    const routeText = source("app/api/chat/route.ts");

    expect(chatText).toContain("const CHAT_POST_TIMEOUT_MS = 45000;");
    expect(chatText).toContain("idempotentFetchWithTimeout('/api/chat'");
    expect(chatText).toContain("const coerceAssistantResponse = useCallback");
    expect(chatText).toContain("hasAssistantAfterMessage(prev, userMessage.id)");
    expect(chatText).toContain("silent-fallback");
    expect(chatText).toContain("Não recebi uma resposta completa.");
    expect(routeText).toContain("const AGENT_API_TIMEOUT_MS = 30000;");
    expect(routeText).toContain("function extractAgentReply");
    expect(routeText).toContain("localizedChatFallback");
    expect(routeText).not.toContain("No valid response received from the agent API.");
  });

  it("only shows the retry banner while the submitted message has no real assistant completion", () => {
    const chatText = source("components/chat/chat-window.tsx");

    expect(chatText).toContain("const [retryMessageId, setRetryMessageId] = useState('');");
    expect(chatText).toContain("setRetryMessageId(userMessage.id);");
    expect(chatText).toContain("completionOnly: true");
    expect(chatText).toContain("isLocalNonCompletionAssistantMessage");
    expect(chatText).toContain("const pendingRetryText = retryText && retryMessageId");
    expect(chatText).toContain("setRetryMessageId(\"\");");
    expect(chatText).toContain("window.setTimeout(fetchServerMessages, 500);");
  });

  it("does not clear the browser session for logout confirmation links", () => {
    const chatText = source("components/chat/chat-window.tsx");

    expect(chatText).toContain("const isCompletedLogoutResponse = (message: string)");
    expect(chatText).toContain("if (isCompletedLogoutResponse(botResponse))");
    expect(chatText).not.toContain('String(action || "").toLowerCase() === "logout_wallet"');
  });
});
