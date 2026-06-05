import { describe, expect, it } from "vitest";
import { mergeChatMessages, shouldAppendImmediateAssistantMessage } from "@/lib/chat-message-merge";

describe("mergeChatMessages", () => {
  it("keeps local messages while the backend has not persisted them yet", () => {
    const current = [
      {
        id: "user-100",
        role: "user" as const,
        content: "quero ver saldo",
        createdAt: new Date("2026-06-04T10:00:00.000Z"),
      },
    ];

    const merged = mergeChatMessages(current, [
      {
        id: "backend-old",
        role: "assistant",
        content: "Mensagem anterior",
        created_at: "2026-06-04T09:59:00.000Z",
      },
    ]);

    expect(merged).toEqual([
      {
        id: "server-backend-old",
        backendId: "backend-old",
        role: "assistant",
        content: "Mensagem anterior",
        createdAt: new Date("2026-06-04T09:59:00.000Z"),
      },
      current[0],
    ]);
  });

  it("replaces an optimistic local message when the persisted backend copy arrives", () => {
    const merged = mergeChatMessages([
      {
        id: "user-101",
        role: "user",
        content: "quero mandar 10 xlm pra ana silva",
        createdAt: new Date("2026-06-04T10:00:00.000Z"),
      },
    ], [
      {
        id: "backend-user-101",
        role: "user",
        content: "quero mandar 10 xlm pra ana silva",
        created_at: "2026-06-04T10:00:01.000Z",
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "server-backend-user-101",
      backendId: "backend-user-101",
      role: "user",
      content: "quero mandar 10 xlm pra ana silva",
    });
  });

  it("removes the welcome placeholder only when real server history arrives", () => {
    const current = [
      {
        id: "agent-welcome",
        role: "assistant" as const,
        content: "Como posso ajudar?",
        createdAt: new Date("2026-06-04T10:00:00.000Z"),
      },
    ];

    expect(mergeChatMessages(current, [], { removeWelcomeId: "agent-welcome" })).toBe(current);
    expect(mergeChatMessages(current, [
      {
        id: "backend-1",
        role: "assistant",
        content: "Histórico carregado",
        created_at: "2026-06-04T10:00:01.000Z",
      },
    ], { removeWelcomeId: "agent-welcome" })).toEqual([
      {
        id: "server-backend-1",
        backendId: "backend-1",
        role: "assistant",
        content: "Histórico carregado",
        createdAt: new Date("2026-06-04T10:00:01.000Z"),
      },
    ]);
  });

  it("does not suppress the same assistant response from an older turn", () => {
    const olderAssistant = {
      id: "bot-old",
      role: "assistant" as const,
      content: "Abra seu saldo aqui:\nhttps://talktostellar.com/r/abc",
      createdAt: new Date("2026-06-04T10:00:00.000Z"),
    };
    const candidate = {
      role: "assistant" as const,
      content: "Abra seu saldo aqui:\nhttps://talktostellar.com/r/abc",
      createdAt: new Date("2026-06-04T10:05:02.000Z"),
    };

    expect(shouldAppendImmediateAssistantMessage(
      [olderAssistant],
      candidate,
      new Date("2026-06-04T10:05:00.000Z"),
    )).toBe(true);
  });

  it("dedupes only if the same assistant response already arrived after the current send", () => {
    const serverAssistant = {
      id: "server-new",
      backendId: "new",
      role: "assistant" as const,
      content: "Abra seu saldo aqui:\nhttps://talktostellar.com/r/abc",
      createdAt: new Date("2026-06-04T10:05:01.000Z"),
    };
    const candidate = {
      role: "assistant" as const,
      content: "Abra seu saldo aqui:\nhttps://talktostellar.com/r/abc",
      createdAt: new Date("2026-06-04T10:05:02.000Z"),
    };

    expect(shouldAppendImmediateAssistantMessage(
      [serverAssistant],
      candidate,
      new Date("2026-06-04T10:05:00.000Z"),
    )).toBe(false);
  });
});
