export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getSessionActivityTime(session: any): number {
  const candidates = [
    session?.last_activity,
    session?.updated_at,
    session?.created_at,
  ];

  for (const candidate of candidates) {
    const timestamp = Date.parse(String(candidate || ''));
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

export function isSessionExpired(session: any, now = Date.now()): boolean {
  if (!session) return true;
  const activityTime = getSessionActivityTime(session);
  if (!activityTime) return true;
  return now - activityTime > SESSION_TTL_MS;
}
