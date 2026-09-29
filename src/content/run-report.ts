import type { Action } from "@/shared/actions";
import { fieldIdOf } from "@/shared/actions";
import type { SensitiveFlag } from "@/shared/page";
import type { AbortReason, ActionResult, ResultReason, RunReport } from "@/shared/results";
import { countStatuses } from "@/shared/results";

/**
 * Section 7: what a run says about itself.
 *
 * Separated from the loop because it is the part with a contract attached. The
 * loop can be rewritten; this shape is mirrored by `/results` in naijagov-api and
 * validated there against a fixed vocabulary.
 *
 * **Nothing built here can carry content.** An action result is an action id, a
 * field id, a status and a reason code — and `fieldPart` is the only place a field
 * id is ever attached, so there is one line to read to be sure of that.
 */

/** Why the batch stopped, if it did. Empty means it ran to the end. */
export interface Stop {
  aborted?: AbortReason;
  checkpoint?: SensitiveFlag;
}

/** Everything the batch did not reach, with the reason it did not. */
export function cancelFrom(actions: readonly Action[], from: number, stop: Stop): ActionResult[] {
  const reason = reasonFor(stop);

  return actions.slice(from).map((action) => ({
    actionId: action.actionId,
    ...fieldPart(action),
    status: "cancelled" as const,
    reason,
  }));
}

export function rejectAll(actions: readonly Action[], reason: ResultReason): ActionResult[] {
  return actions.map((action) => ({
    actionId: action.actionId,
    ...fieldPart(action),
    status: "rejected" as const,
    reason,
  }));
}

function reasonFor(stop: Stop): ResultReason {
  if (stop.checkpoint) return "CHECKPOINT";

  switch (stop.aborted) {
    case "navigated":
      return "NAVIGATED";
    case "timeout":
      return "TIMEOUT";
    case "stale_page":
      return "STALE_PAGE";
    default:
      return "CANCELLED";
  }
}

/**
 * The whole report.
 *
 * `afterIndex` is how many actions had run when it stopped — a position, which is
 * the most detail a checkpoint may carry about where on the page it happened.
 */
export function buildReport(
  results: readonly ActionResult[],
  stop: Stop,
  afterIndex: number,
  startedAt: number,
): RunReport {
  return {
    results: [...results],
    totals: countStatuses(results),
    elapsedMs: Date.now() - startedAt,
    ...(stop.aborted ? { aborted: stop.aborted } : {}),
    ...(stop.checkpoint
      ? {
          checkpoint: {
            kind: stop.checkpoint.kind,
            afterIndex,
            ...(stop.checkpoint.fieldId ? { fieldId: stop.checkpoint.fieldId } : {}),
          },
        }
      : {}),
  };
}

/** `pause` has no field, and a result may not invent one. */
export function fieldPart(action: Action): { fieldId?: string } {
  const fieldId = fieldIdOf(action);
  return fieldId === undefined ? {} : { fieldId };
}
