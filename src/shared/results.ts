import type { FieldId } from "@/shared/actions";
import type { SensitiveKind } from "@/shared/page";

/**
 * What a run reports, and the words it is allowed to use.
 *
 * This file is a contract with naijagov-api, the same way `actions.ts` is. Every
 * name below is mirrored in `src/results/constants.py` — `RESULT_STATUSES`,
 * `RESULT_REASONS`, `ABORT_REASONS`, `MAX_RESULTS` — and that endpoint *validates*
 * the codes rather than accepting free text, so a code invented on this side is a
 * 400, not a silent widening. Changing anything here is a two-repo change.
 *
 * The important property is negative, and it is the same one `page.ts` has:
 * **nothing here has a slot for a value, a label, or any page text.** A result
 * says which action, which field, how it went and why. What was written is already
 * in the user's browser and has no business in a message, a log, or a database.
 * The backend keeps a tripwire that refuses a report carrying `value` or `label`;
 * this is the shape that cannot trip it.
 */

/** How one action ended. */
export const ACTION_STATUSES = [
  /** It ran and the read-back confirmed it exactly. */
  "ok",
  /** It ran and the page rewrote what we wrote — stripped spaces, reformatted a date. */
  "changed",
  /** It ran and did not take. Amber, not a success. */
  "failed",
  /** The validator refused it. It never touched the page. */
  "rejected",
  /** The batch stopped before reaching it. */
  "cancelled",
] as const;

export type ActionStatus = (typeof ACTION_STATUSES)[number];

/**
 * Why it was not `ok`.
 *
 * The first five are batch-level: the run never really started, or it stopped for
 * the whole page. The rest are per-action, listed in the order the validator
 * checks them, with `NOT_ACCEPTED` last because it is the only one that is decided
 * after a write rather than before.
 */
export const RESULT_REASONS = [
  "STALE_PAGE",
  "CHECKPOINT",
  "NAVIGATED",
  "TIMEOUT",
  "CANCELLED",
  "MALFORMED",
  "UNKNOWN_FIELD",
  "DETACHED",
  "NOT_VISIBLE",
  "NOT_WRITABLE",
  "SENSITIVE_FIELD",
  "WRONG_TYPE",
  "MANUAL_FIELD",
  "BAD_OPTION",
  "NOT_ACCEPTED",
] as const;

export type ResultReason = (typeof RESULT_REASONS)[number];

/**
 * What happened to one action.
 *
 * `actionId` is the positional id the backend minted in the plan (`a1`, `a2`), so
 * a result can be matched to the row the user actually approved. `fieldId` is
 * ours. Neither is content, and there is nowhere else for content to go.
 */
export interface ActionResult {
  actionId: string;
  /** Absent only for a `pause`, which addresses no element. */
  fieldId?: FieldId;
  status: ActionStatus;
  /** Required by the backend for every status but `ok`. */
  reason?: ResultReason;
}

/**
 * Why a whole batch stopped.
 *
 * Narrower than `RESULT_REASONS`: these three are the only aborts the engine
 * decides on its own. A checkpoint is reported separately, because it is the one
 * stop that means the safety layer worked rather than that something broke.
 */
export const ABORT_REASONS = ["stale_page", "navigated", "timeout"] as const;

export type AbortReason = (typeof ABORT_REASONS)[number];

/**
 * Where a run stopped because the page asked for something only the user can give.
 *
 * `kind` is the detector's own category and not a sentence — the sentence the user
 * reads travels on `CHECKPOINT_DETECTED`, which is a different audience. Counting
 * kinds is only possible if the vocabulary is fixed.
 */
export interface CheckpointReport {
  kind: SensitiveKind;
  /** How many actions had already run. A position, not content. */
  afterIndex: number;
  fieldId?: FieldId;
}

export interface RunTotals {
  ok: number;
  changed: number;
  failed: number;
  rejected: number;
  cancelled: number;
}

/** One batch, from pre-flight to the last read-back. */
export interface RunReport {
  results: ActionResult[];
  totals: RunTotals;
  /** Wall-clock milliseconds for the whole batch, including the pauses. */
  elapsedMs: number;
  aborted?: AbortReason;
  checkpoint?: CheckpointReport;
}

/**
 * At most thirty actions in a batch.
 *
 * Matches the backend's `MAX_ACTIONS` and its `MAX_RESULTS`: a report longer than
 * the plan it reports on is not a report.
 */
export const MAX_BATCH_ACTIONS = 30;

/** At most ten seconds for the whole batch, however many actions are left. */
export const BATCH_TIMEOUT_MS = 10_000;

/** Between actions. Frameworks re-render between writes; a burst produces races. */
export const ACTION_PAUSE_MS = 40;

export function countStatuses(results: readonly ActionResult[]): RunTotals {
  const totals: RunTotals = { ok: 0, changed: 0, failed: 0, rejected: 0, cancelled: 0 };
  for (const result of results) totals[result.status] += 1;
  return totals;
}

/**
 * A finished run, as the panel renders it.
 *
 * The report is what the page reported. `hint` and `finalStep` are what the backend
 * said to do next, and both are optional because `/results` is allowed to fail: an
 * offline backend costs the footer its sentence, not the summary.
 *
 * Stored on the turn that carried the plan, which is also where the field *labels*
 * live. That split is deliberate and is the reason a results summary can name
 * "Reference number" while nothing in `ActionResult` carries a label: the label was
 * already in the browser, in the plan the user approved, and it never has to travel
 * back from the page or out to the backend to be printed.
 */
export interface RunOutcome {
  report: RunReport;
  /** The backend's next-step sentence, printed verbatim. */
  hint?: string;
  /** True when the backend says this page is the workflow's last step. */
  finalStep?: boolean;
}

/** Did anything at all reach the page? Decides the summary's header wording. */
export function anySucceeded(totals: RunTotals): boolean {
  return totals.ok > 0 || totals.changed > 0;
}

/** The rows that need the user: refused before the write, or refused by the page. */
export function needsUser(result: ActionResult): boolean {
  return result.status === "failed" || result.status === "rejected";
}
