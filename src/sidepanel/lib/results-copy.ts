import type { ActionResult, ActionStatus, ResultReason, RunTotals } from "@/shared/results";

/**
 * Everything the panel says about a run, in one place.
 *
 * One catalogue, keyed by code, so the summary never improvises on this topic. The
 * rule every sentence below is written to is short and it is not a style
 * preference: **nothing here hints at a way round the thing that stopped us.** A
 * field the Copilot refused says who has to do it instead; it does not explain what
 * the field wants, suggest a value, or imply the refusal is a technicality.
 *
 * The spec tabulates six of these. This covers every `ResultReason` the engine can
 * produce, because a code with no sentence is a row that renders as a bare status
 * word — and the codes it leaves out are exactly the ones a demo will not hit and a
 * real portal will.
 *
 * The *reason* catalogue — why the Copilot stopped at a checkpoint — is not here. It
 * is `SENSITIVE_REASONS` in `shared/page.ts`, because the content script prints those
 * too and there is one of it rather than two.
 */

const REASON_COPY: Record<ResultReason, string> = {
  // Batch-level: the run never really started, or it stopped for the whole page.
  STALE_PAGE: "The page changed before I got to this one.",
  CHECKPOINT: "Stopped before I got to this one.",
  NAVIGATED: "The page moved on before I got to this one.",
  TIMEOUT: "I ran out of time before reaching this one.",
  CANCELLED: "Stopped before I got to this one.",

  // Per-action, in the order the validator checks them.
  MALFORMED: "I couldn't read this step of the plan, so I left the field alone.",
  UNKNOWN_FIELD: "This field wasn't on the page any more when I reached it.",
  DETACHED: "This field left the page while I was working.",
  NOT_VISIBLE: "This field is hidden on the page at the moment.",
  NOT_WRITABLE: "This field is locked on the page.",
  SENSITIVE_FIELD: "This one needs you — I don't fill fields like this.",
  // Covers two cases, because the vocabulary has one code for both: a fill aimed at
  // a control that cannot take one, and a click aimed at a navigation link. Links
  // are never followed by the Copilot — going somewhere is the user's decision.
  WRONG_TYPE: "This isn't something I can fill or click — it's yours to use.",
  MANUAL_FIELD: "This one uses a custom picker — please choose it yourself.",
  BAD_OPTION: "That option isn't in the list — pick one yourself.",
  NOT_ACCEPTED: "The page didn't accept this value. Check it and try again.",
};

/** When a row carries no reason. Every status but `ok` should, so these are a floor. */
const STATUS_COPY: Record<ActionStatus, string> = {
  ok: "Filled.",
  changed: "Filled, but the page reformatted it — worth a look.",
  failed: "This one needs you.",
  rejected: "This one needs you.",
  cancelled: "Stopped before I got to this one.",
};

/**
 * What one row says about itself.
 *
 * `changed` reads from the status rather than the reason on purpose: it is the one
 * outcome where the write succeeded and the *page* did something, so "the page
 * reformatted it" is the whole story and any validator code attached to it would be
 * describing a different event.
 */
export function describeResult(result: ActionResult): string {
  if (result.status === "changed") return STATUS_COPY.changed;
  if (result.reason) return REASON_COPY[result.reason];

  return STATUS_COPY[result.status];
}

/** The status in words, so colour never carries the meaning on its own. */
const STATUS_WORD: Record<ActionStatus, string> = {
  ok: "Filled",
  changed: "Changed by the page",
  failed: "Needs you",
  rejected: "Needs you",
  cancelled: "Cancelled",
};

export function statusWord(status: ActionStatus): string {
  return STATUS_WORD[status];
}

/**
 * The summary's header.
 *
 * Honest before encouraging. A run with a failure in it says so in the first line
 * rather than leading with the count that flatters it, and a run where nothing
 * landed does not dress that up as a partial success.
 */
export function summaryHeader(totals: RunTotals): string {
  const filled = totals.ok + totals.changed;
  const needs = totals.failed + totals.rejected;
  const total = filled + needs + totals.cancelled;

  if (filled === 0) return "I couldn't fill any of these";
  if (needs === 0) return `Filled ${filled} of ${total}`;

  return `Filled ${filled} of ${total} — ${needs} ${needs === 1 ? "needs" : "need"} you`;
}

/**
 * The footer, when the backend has not answered.
 *
 * Claims nothing about the page and puts the next move on the user, which is true
 * whatever happened. The firmer final-step wording is the backend's and only ever
 * arrives from it — the panel has no way to know a step is the last one, and
 * guessing at that is the one place this sentence could do harm.
 */
export const DEFAULT_NEXT_HINT = "Review the form, then click Continue yourself.";

/** A line above the groups when the run did not get to the end. */
export function abortNote(aborted: "stale_page" | "navigated" | "timeout"): string {
  switch (aborted) {
    case "navigated":
      return "The page moved on before I finished.";
    case "timeout":
      return "I ran out of time before finishing.";
    case "stale_page":
      return "The page changed before I finished.";
  }
}
