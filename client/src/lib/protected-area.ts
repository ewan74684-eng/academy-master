// Client side of the protected area (Employees, Expenses, Special Needs players). The server
// decides what is locked; this only reacts to its answers.

export const PROTECTED_AREA_STATUS_KEY = ["/api/protected-area"] as const;
export const PROTECTED_AREA_LOCKED_EVENT = "protected-area-locked";
// Set by the server on "locked" 403s, and on lists that left protected rows out
const LOCKED_HEADER = "X-Protected-Area";
const HIDDEN_HEADER = "X-Protected-Area-Hidden";

export interface ProtectedAreaStatus {
  configured: boolean;
  unlocked: boolean;
  /** Local time (ms) at which the unlock runs out; null while locked. */
  expiresAt: number | null;
  timeoutMinutes: number;
}

export function toProtectedAreaStatus(body: {
  configured: boolean;
  unlocked: boolean;
  expiresInMs: number | null;
  timeoutMinutes: number;
}): ProtectedAreaStatus {
  return {
    configured: body.configured,
    unlocked: body.unlocked,
    expiresAt: body.unlocked && body.expiresInMs !== null ? Date.now() + body.expiresInMs : null,
    timeoutMinutes: body.timeoutMinutes,
  };
}

/** How many rows a list response left out because the protected area is locked. */
export function hiddenProtectedCount(res: Response): number {
  return Number(res.headers.get(HIDDEN_HEADER)) || 0;
}

/**
 * Announces every "locked" response, whichever code made the request (many components call
 * fetch directly rather than apiRequest), so the UI can lock itself and ask for the password.
 */
export function watchForProtectedAreaLocks() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await nativeFetch(...args);
    if (res.status === 403 && res.headers.get(LOCKED_HEADER) === "locked") {
      window.dispatchEvent(new Event(PROTECTED_AREA_LOCKED_EVENT));
    }
    return res;
  };
}
