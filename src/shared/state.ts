import type { Action, ActionResult } from "@/shared/actions";

/**
 * Everything the extension does sits in one of these states.
 *
 *   IDLE → READING → READY ⇄ PLANNING → AWAITING_CONFIRMATION → EXECUTING → READY
 *                                                       ↓
 *                                   CHECKPOINT (paused) ←┘  → READING
 *
 * The detector can force CHECKPOINT from any state. Nothing can move out of
 * CHECKPOINT except the user choosing to continue.
 */
export const COPILOT_STATES = [
  /** No valid token, or the panel just opened. */
  "IDLE",
  /** Serializing the page and running the detector. */
  "READING",
  /** Waiting for the user. Explaining happens from here and does not leave it. */
  "READY",
  /** A plan is in flight. The panel shows "Thinking…". */
  "PLANNING",
  /** The fill preview is on screen. Nothing has touched the page yet. */
  "AWAITING_CONFIRMATION",
  /** Actions run one at a time, each re-checked immediately before it runs. */
  "EXECUTING",
  /** The detector fired. Pending actions are cancelled. Only the user proceeds. */
  "CHECKPOINT",
] as const;

export type CopilotState = (typeof COPILOT_STATES)[number];

export function isCopilotState(value: unknown): value is CopilotState {
  return typeof value === "string" && (COPILOT_STATES as readonly string[]).includes(value);
}

/**
 * What is persisted to `chrome.storage.session`, per tab.
 *
 * This is the whole of the extension's live state. It lives in session storage
 * and not in a module variable because MV3 kills the service worker after about
 * thirty seconds idle — a closure is empty by the user's second click.
 */
export interface SessionState {
  state: CopilotState;
  tabId?: number;
  pageHash?: string;
  workflowId?: string;
  stepId?: string;
  /** Planned but unconfirmed. Cleared, never kept, when a checkpoint fires. */
  pendingActions?: Action[];
  lastResults?: ActionResult[];
}

export const INITIAL_SESSION: SessionState = { state: "IDLE" };

export const SESSION_KEY_PREFIX = "session:";

/**
 * The storage key for a tab's state.
 *
 * Shared so that the side panel can *read* session state on mount. Only the
 * service worker writes it.
 */
export function sessionKey(tabId: number): string {
  return `${SESSION_KEY_PREFIX}${tabId}`;
}

/**
 * Is this one of the per-tab session entries?
 *
 * A disconnect has to clear every tab's state without knowing which tabs exist,
 * and `chrome.storage.session` also holds things that are not per-tab — the
 * health result — which must survive.
 */
export function isSessionEntryKey(key: string): boolean {
  return key.startsWith(SESSION_KEY_PREFIX);
}

/** Where the worker parks the last backend health result. Not per tab. */
export const HEALTH_KEY = "health";

/**
 * What the account owns in `chrome.storage.local`.
 *
 * That storage is not encrypted, which is exactly why a disconnect has to be
 * able to name everything it must remove. Anything added here later is removed
 * on disconnect for free; anything stored under a key that is *not* here would
 * quietly outlive the account it belongs to.
 */
export const TOKEN_KEY = "token";
export const PROFILE_KEY = "profile";
export const ACCOUNT_KEYS = [TOKEN_KEY, PROFILE_KEY] as const;

export interface HealthState {
  reachable: boolean;
  /** When this was checked, as an epoch millisecond timestamp. */
  checkedAt: number;
  /** Present when the backend answered and named a version. */
  version?: string;
}

export function isSessionState(value: unknown): value is SessionState {
  return (
    typeof value === "object" &&
    value !== null &&
    isCopilotState((value as { state?: unknown }).state)
  );
}
