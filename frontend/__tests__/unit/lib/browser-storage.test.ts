import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocalStorage, safeSessionStorage } from "@/lib/browser-storage";

describe("browser storage helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("reads and writes localStorage when available", () => {
    expect(safeLocalStorage.set("key", "value")).toBe(true);
    expect(safeLocalStorage.get("key")).toBe("value");
    expect(safeLocalStorage.remove("key")).toBe(true);
    expect(safeLocalStorage.get("key")).toBeNull();
  });

  it("returns fallback values when storage methods throw", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(window.localStorage.__proto__, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(safeLocalStorage.get("key")).toBeNull();
    expect(safeLocalStorage.set("key", "value")).toBe(false);
    expect(safeLocalStorage.remove("key")).toBe(false);
  });

  it("returns fallback values when sessionStorage is unavailable", () => {
    vi.spyOn(window.sessionStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(safeSessionStorage.get("chat-session")).toBeNull();
  });
});
