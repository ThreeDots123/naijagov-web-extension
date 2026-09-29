import type { Action } from "@/shared/actions";
import type { ActionResultsMessage, ActionRetriedMessage } from "@/shared/messages";
import { sendToTab } from "@/shared/messages";
import { SENSITIVE_REASONS } from "@/shared/page";
import type { ActionResult, RunReport } from "@/shared/results";
import { countStatuses } from "@/shared/results";

import { raiseCheckpoint } from "@/sw/page";
import { reread } from "@/sw/plan-page";
import { mergeRetry, recordRun } from "@/sw/results";
import { getSession, setSession, setState } from "@/sw/session";

/**
 * Handing a batch to the page, and deciding what its answer means.
 *
 * This is awaited rather than started and forgotten, and that is the whole reason
 * it is a function on its own. MV3 stops the service worker about thirty seconds
 * after its last event, and a run left to finish on its own would be a run whose
 * results arrive at a worker that has been killed and restarted with no idea a run
 * was happening. A pending `sendMessage` keeps the worker alive for exactly as long
 * as the page is working, which is the only version of this that survives a demo.
 */

/**
 * Run whatever the user approved for this tab.
 *
 * The actions come from `chrome.storage.session` rather than from the caller: the
 * approval that put them there may have been several worker lifetimes ago, and
 * storage is the only thing that spans those.
 */
export async function runPendingActions(tabId: number): Promise<RunReport> {
  const { pendingActions = [] } = await getSession(tabId);

  // Cleared before the batch runs, not after. A worker killed mid-run must not
  // wake up and find a plan it could replay against a page that has moved on.
  await setSession(tabId, { pendingActions: [] });

  if (pendingActions.length === 0) {
    await setState(tabId, "READY");
    return empty();
  }

  const report = await dispatch(tabId, pendingActions);

  // The summary is written before the tab is moved on, so a panel watching the state
  // never sees `READY` with nothing to show for the run that just finished.
  await recordRun(tabId, report);
  await settle(tabId, report);

  return report;
}

/**
 * Run one action from the last batch again.
 *
 * `Try again` on a row the page refused. The action is taken from what was
 * dispatched rather than rebuilt from the plan, so what is resent is exactly what
 * the user approved — including a value they corrected in the preview, which exists
 * nowhere else.
 *
 * It is not a privileged path. The action goes through `EXECUTE_ACTIONS` like any
 * other, which means the validator re-checks it against the live page and the
 * current registry: a page that has moved since the run refuses it, rather than
 * writing a value into whatever now occupies that position.
 */
export async function retryAction(
  tabId: number,
  turnRef: string,
  actionId: string,
): Promise<ActionRetriedMessage> {
  const { lastRun } = await getSession(tabId);

  // A retry for a run this tab has already moved past. The row stays as it was
  // rather than being reported as a fresh failure it did not have.
  if (!lastRun || lastRun.turnId !== turnRef) return { type: "ACTION_RETRIED" };

  const action = lastRun.actions.find((entry) => entry.actionId === actionId);
  if (!action) return { type: "ACTION_RETRIED" };

  await setState(tabId, "EXECUTING");

  const report = await dispatch(tabId, [action]);
  const result = report.results[0];

  if (result) await mergeRetry(tabId, turnRef, result);
  await settle(tabId, report);

  return result ? { type: "ACTION_RETRIED", result } : { type: "ACTION_RETRIED" };
}

/**
 * Send the batch, and treat a page that will not answer as a lost run.
 *
 * "Receiving end does not exist" here means the tab navigated between approval and
 * dispatch, so the content script holding the ids is already gone. That is not an
 * error to show the user a stack trace for — it is a run that did not happen, and
 * it is reported as one.
 */
async function dispatch(tabId: number, actions: readonly Action[]): Promise<RunReport> {
  let reply: ActionResultsMessage;

  try {
    reply = await sendToTab(tabId, { type: "EXECUTE_ACTIONS", actions: [...actions] });
  } catch {
    const results: ActionResult[] = actions.map((action) => ({
      actionId: action.actionId,
      ...(action.type === "pause" ? {} : { fieldId: action.fieldId }),
      status: "cancelled" as const,
      reason: "NAVIGATED" as const,
    }));

    return { results, totals: countStatuses(results), elapsedMs: 0, aborted: "navigated" };
  }

  return reply.report;
}

/**
 * Where the tab goes next.
 *
 * A checkpoint is the one outcome that is not the run's to decide: it goes through
 * `raiseCheckpoint`, which is also what clears anything still pending and tells the
 * panel. A stale page goes back to `READING`, because the honest answer to "the
 * page moved under us" is to look at it again. Everything else — including a run
 * where half the fields refused — is `READY`, since the user can see what happened
 * and the next move is theirs.
 */
async function settle(tabId: number, report: RunReport): Promise<void> {
  if (report.checkpoint) {
    const { kind, fieldId } = report.checkpoint;

    await raiseCheckpoint(
      tabId,
      {
        kind,
        reason: SENSITIVE_REASONS[kind],
        ...(fieldId === undefined ? {} : { fieldId }),
      },
      // The engine already cancelled them; this is the count the banner reports.
      { cancelled: report.totals.cancelled },
    );
    return;
  }

  if (report.aborted === "stale_page" || report.aborted === "navigated") {
    try {
      await reread(tabId);
    } catch {
      // The page is gone or still loading, so there is nothing to read yet. The
      // tab is left at `READING`, which is true, and the content script's own
      // observer will push a snapshot the moment the new page settles.
    }
    return;
  }

  await setState(tabId, "READY");
}

function empty(): RunReport {
  return { results: [], totals: countStatuses([]), elapsedMs: 0 };
}
