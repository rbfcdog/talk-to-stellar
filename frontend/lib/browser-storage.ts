type StorageKind = "localStorage" | "sessionStorage";

function storage(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

export function safeStorageGet(kind: StorageKind, key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSet(kind: StorageKind, key: string, value: string): boolean {
  try {
    storage(kind)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(kind: StorageKind, key: string): boolean {
  try {
    storage(kind)?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const safeLocalStorage = {
  get: (key: string) => safeStorageGet("localStorage", key),
  set: (key: string, value: string) => safeStorageSet("localStorage", key, value),
  remove: (key: string) => safeStorageRemove("localStorage", key),
};

export const safeSessionStorage = {
  get: (key: string) => safeStorageGet("sessionStorage", key),
  set: (key: string, value: string) => safeStorageSet("sessionStorage", key, value),
  remove: (key: string) => safeStorageRemove("sessionStorage", key),
};
