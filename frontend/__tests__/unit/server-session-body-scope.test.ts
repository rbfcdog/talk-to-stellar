import { describe, expect, it } from "vitest";
import { augmentJsonBodyWithSession } from "@/lib/server-session";

describe("server-session body scoping", () => {
  it("injects WhatsApp session credentials when body has source=chat and session_scope=whatsapp", () => {
    const request = new Request("https://app.test/api/ramp/etherfuse/customer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=web",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
    });

    const body = JSON.stringify({
      session_id: "web-session",
      source: "chat",
      session_scope: "whatsapp",
      amount: "100",
    });

    const augmented = augmentJsonBodyWithSession(body, request);
    const payload = JSON.parse(String(augmented));

    expect(payload).toMatchObject({
      session_id: "whatsapp-session",
      session_token: "whatsapp-token",
      session_source: "whatsapp",
      source: "chat",
      session_scope: "whatsapp",
      amount: "100",
    });
  });
});
