import type { Action } from "@/shared/actions";
import type { ActionResult } from "@/shared/results";
import { isChatEntryKey } from "@/shared/chat";

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
  /**
   * Why the page is paused, when it is.
   *
   * Stored rather than only broadcast, because a panel opened *after* the
   * detector fired would otherwise show a checkpoint it cannot explain.
   */
  checkpointReason?: string;
  /** Planned but unconfirmed. Cleared, never kept, when a checkpoint fires. */
  pendingActions?: Action[];
  lastResults?: ActionResult[];
  /**
   * What `POST /context` established about this page, and which of our own reads it
   * belongs to.
   *
   * Kept because `POST /plan` needs a `session_id` and cannot obtain one itself, and
   * because the server's hash is not ours: `/context` computes SHA-256 over the URL
   * path and the field triples, we compute FNV-1a over the whole canonical snapshot,
   * and the two never agree. The backend's contract says the extension adopts the
   * server's value for the `PAGE_CHANGED` comparison, so both are stored and each is
   * used for the one job it can do.
   */
  context?: PageContextRef;
  /** The pending plan, for the approval path. Cleared on approval and on cancel. */
  pendingPlan?: PendingPlanRef;
}

export interface PageContextRef {
  sessionId: string;
  /** The server's hash. Sent back on `/plan`; never compared against ours. */
  serverPageHash: string;
  /**
   * Our own hash of the read this context describes.
   *
   * When the live page no longer hashes to this, the context is stale and `/context`
   * is posted again before the next plan. Comparing our hash to our hash is the only
   * comparison that means anything locally.
   */
  localPageHash: string;
  supported: boolean;
}

export interface PendingPlanRef {
  planId: string;
  /** The transcript turn holding the preview, so approval can find it. */
  turnId: string;
  /**
   * Our local hash when the plan was made.
   *
   * Re-checked at approval. If the page has moved since, the plan is discarded
   * rather than applied to a page it was not built for.
   */
  localPageHash: string;
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
 * Is this one of the per-tab entries a disconnect must remove?
 *
 * A disconnect has to clear every tab's state without knowing which tabs exist,
 * and `chrome.storage.session` also holds things that are not per-tab — the
 * health result — which must survive.
 *
 * Transcripts count. A tab's chat holds values the user gave this account, and a
 * thread that outlived the account it belongs to is exactly the leak the disconnect
 * exists to prevent.
 */
export function isSessionEntryKey(key: string): boolean {
  return key.startsWith(SESSION_KEY_PREFIX) || isChatEntryKey(key);
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
