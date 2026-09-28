import type { Plan, PlanErrorCode } from "@/shared/plan";

/**
 * The transcript.
 *
 * Held per tab in `chrome.storage.session`, so closing the panel does not lose the
 * thread and the service worker going to sleep does not either. The panel reads
 * it; the worker writes it — the same division as the state machine, for the same
 * reason.
 *
 * This is the one place in the extension that stores values the user gave us, and
 * it stores them for exactly as long as the tab lives. `session` and not `local`:
 * a transcript that outlived the browser would be a record of someone's passport
 * application sitting unencrypted on a shared machine.
 */

/**
 * How far a fill preview has got.
 *
 * `pending` is the only state that shows a card with live controls. The rest are
 * history: the turn stays in the transcript so the user can scroll back to what
 * was proposed, but nothing about it is actionable any more.
 */
export type PreviewStatus = "pending" | "approved" | "cancelled" | "stale";

export interface UserTurn {
  id: string;
  role: "user";
  text: string;
  /** Epoch milliseconds. */
  at: number;
}

export interface CopilotTurn {
  id: string;
  role: "copilot";
  /** The backend's `reply`. Printed verbatim. */
  text: string;
  at: number;
  /** Present when this turn carried a plan. */
  plan?: Plan;
  status?: PreviewStatus;
  /**
   * How many rows the user actually approved.
   *
   * Written when the card collapses, so the summary line can say "Filling 4 of 6"
   * without the transcript having to keep the selection itself. Which rows were
   * ticked, and any value the user corrected, live in the open card and travel with
   * `PLAN_APPROVE` — there is no second copy to disagree with what is on screen.
   */
  approvedCount?: number;
}

/**
 * A failed turn, as a system note rather than a Copilot turn.
 *
 * Styled apart on purpose. The Copilot saying "I can't reach the assistant" would
 * be the Copilot claiming to have spoken when it never ran.
 *
 * `retryMessage` is the user's original text, kept so a Retry button can resend
 * exactly what was asked rather than approximately.
 */
export interface SystemTurn {
  id: string;
  role: "system";
  code: PlanErrorCode;
  /** The backend's sentence where there is one, ours where there isn't. */
  text: string;
  at: number;
  retryMessage?: string;
  /** Seconds. Only `RATE_LIMITED` carries one. */
  retryAfter?: number;
}

export type Turn = UserTurn | CopilotTurn | SystemTurn;

/**
 * How many turns a tab keeps.
 *
 * `chrome.storage.session` is bounded, and a plan carries real values, so the
 * transcript cannot grow without limit. Oldest dropped first. Generous enough that
 * no ordinary session reaches it.
 */
export const MAX_TURNS = 60;

export const CHAT_KEY_PREFIX = "chat:";

/** Where a tab's transcript lives. Shared so the panel can read it on mount. */
export function chatKey(tabId: number): string {
  return `${CHAT_KEY_PREFIX}${tabId}`;
}

export function isChatEntryKey(key: string): boolean {
  return key.startsWith(CHAT_KEY_PREFIX);
}

/**
 * The newest `MAX_TURNS` turns.
 *
 * Applied on every append rather than on a schedule, so there is no moment where
 * the stored transcript is over the cap.
 */
export function capTurns(turns: readonly Turn[]): Turn[] {
  return turns.length <= MAX_TURNS ? [...turns] : turns.slice(turns.length - MAX_TURNS);
}

/**
 * The pending preview in a transcript, if there is one.
 *
 * There is at most one: a plan is only requested from `READY`, and a plan on
 * screen holds the machine at `AWAITING_CONFIRMATION` until it is answered. The
 * search runs backwards because the pending one, when it exists, is the last turn.
 */
export function pendingPreview(turns: readonly Turn[]): CopilotTurn | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.role === "copilot" && turn.plan && turn.status === "pending") return turn;
  }

  return undefined;
}

export function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) return false;
  const role = (value as { role?: unknown }).role;
  return role === "user" || role === "copilot" || role === "system";
}

export function isTranscript(value: unknown): value is Turn[] {
  return Array.isArray(value) && value.every(isTurn);
}

/**
 * A turn id.
 *
 * `crypto.randomUUID` is available in both the worker and the panel. Ids only ever
 * have to be unique within one tab's transcript, so there is nothing to coordinate.
 */
export function turnId(): string {
  return crypto.randomUUID();
}
