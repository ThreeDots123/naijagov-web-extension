import { broadcast } from "@/shared/messages";
import type { CopilotState, SessionState } from "@/shared/state";
import { INITIAL_SESSION, isSessionEntryKey, isSessionState, sessionKey } from "@/shared/state";

/**
 * Per-tab session state, in `chrome.storage.session`.
 *
 * **There is no cache in this file, and there must never be one.** MV3 stops the
 * service worker after about thirty seconds idle and starts a fresh one on the
 * next event. A value held in a module variable is gone by the user's second
 * click — and it goes missing quietly, in the middle of a flow, which is the
 * worst way for it to happen. Every call reads storage.
 *
 * `chrome.storage.session` is also, by default, unreadable from a content
 * script. That is deliberate: the page a user is on never sees what the Copilot
 * knows about their session.
 */

export async function getSession(tabId: number): Promise<SessionState> {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const value = stored[key];
  return isSessionState(value) ? value : { ...INITIAL_SESSION, tabId };
}

/**
 * Merge a patch into a tab's state and return the result.
 *
 * Read-modify-write, not atomic. That is fine here because writes come from one
 * panel acting on one tab. If that ever stops being true, this is the place that
 * needs a queue — not a cache.
 */
export async function setSession(
  tabId: number,
  patch: Partial<SessionState>,
): Promise<SessionState> {
  const current = await getSession(tabId);
  const next: SessionState = { ...current, ...patch, tabId };
  await chrome.storage.session.set({ [sessionKey(tabId)]: next });
  return next;
}

export async function clearSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove(sessionKey(tabId));
}

/**
 * Drop every tab's session state.
 *
 * For a disconnect. Enumerated rather than tracked, because the worker does not
 * keep a list of tabs it has seen — it cannot, for the reason at the top of this
 * file. The health result is not a session entry and survives: it describes the
 * backend, not the person.
 */
export async function clearAllSessions(): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter(isSessionEntryKey);
  if (keys.length > 0) await chrome.storage.session.remove(keys);
}

/**
 * Move a tab to a state and tell the panel.
 *
 * Every state write goes through here, so the panel can never be looking at a
 * state the worker has already left.
 */
export async function setState(tabId: number, state: CopilotState): Promise<SessionState> {
  const next = await setSession(tabId, { state });
  await broadcast({ type: "STATE_CHANGED", state: next.state });
  return next;
}
