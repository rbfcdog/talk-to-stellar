import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueWebChatFeedback, consumeWebChatFeedback } from "@/lib/web-feedback";

describe("web chat feedback channel scoping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("does not enqueue local web-chat feedback from WhatsApp-origin pages", () => {
    window.history.pushState({}, "", "/pix-ramp?source=whatsapp&session_scope=whatsapp");

    enqueueWebChatFeedback("PIX confirmado com sucesso.");

    expect(window.localStorage.getItem("talk-to-stellar.webChatFeedbackQueue")).toBeNull();
    expect(consumeWebChatFeedback()).toEqual([]);
  });

  it("keeps local web-chat feedback available for ordinary web pages", () => {
    window.history.pushState({}, "", "/pix-ramp?source=web");

    enqueueWebChatFeedback("PIX confirmado com sucesso.");

    expect(consumeWebChatFeedback()).toEqual([
      expect.objectContaining({ content: "PIX confirmado com sucesso." }),
    ]);
  });
});
