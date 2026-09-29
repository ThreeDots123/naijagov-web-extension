import { turnId } from "@/shared/chat";
import type { ActionResult, RunOutcome, RunReport } from "@/shared/results";
import { countStatuses } from "@/shared/results";
import type { SessionState } from "@/shared/state";
import { postResults } from "@/sw/api";
import { appendTurn, getTurns, patchTurn } from "@/sw/chat";
import { toResultsRequest } from "@/sw/payload";
import { getSession } from "@/sw/session";

/**
 * What happened to a run, after the run is over.
 *
 * Two jobs, and they are separate on purpose. The **summary** is written onto the
 * turn that carried the plan, because that turn is where the field labels live and
 * because the transcript is what survives the panel being closed — the user is about
 * to go and look at the form, and the summary has to be there when they come back.
 * The **report to the backend** is bookkeeping: it carries ids and statuses, it can
 * fail, and when it does it costs the footer one sentence and nothing else.
 *
 * The order is deliberate. The summary is written first, without the footer, and
 * patched again once `/results` answers. A backend that is slow or down must never
 * be the reason a user cannot see which of their fields got filled.
 */

/** What the transcript says when a run aborted because the page moved under it. */
const STALE_PAGE_NOTE = "The page changed while I was filling it — let me read it again.";

/**
 * Record a finished run.
 *
 * A stale-page abort gets no summary. Nothing it reports is true of the page that is
 * on screen now, and a card listing fields that no longer exist would be worse than
 * silence — so it leaves a line saying what happened, and `sw/run.ts` re-reads.
 */
export async function recordRun(tabId: number, report: RunReport): Promise<void> {
  const session = await getSession(tabId);
  const run = session.lastRun;

  if (report.aborted === "stale_page") {
    await appendTurn(tabId, {
      id: turnId(),
      role: "system",
      text: STALE_PAGE_NOTE,
      at: Date.now(),
    });

    return;
  }

  // No turn to attach to. A transcript long enough to push the turn past its cap, or
  // a run nobody approved through the panel.
  if (!run) return;

  await patchTurn(tabId, run.turnId, { run: { report } });

  const hint = await nextHint(session, run.planId, report);
  if (hint) await patchTurn(tabId, run.turnId, { run: { report, ...hint } });
}

/**
 * `POST /results`, and the sentence it answers with.
 *
 * Every failure is swallowed to `undefined`: an unreachable backend, a rejected
 * body, a session that expired. The footer falls back to its own default sentence,
 * which claims nothing about the page and puts the next move on the user — true
 * whatever happened.
 */
async function nextHint(
  session: SessionState,
  planId: string,
  report: RunReport,
): Promise<Pick<RunOutcome, "hint" | "finalStep"> | undefined> {
  const sessionId = session.context?.sessionId;
  if (!sessionId) return undefined;

  try {
    return await postResults(toResultsRequest({ sessionId, planId, report }));
  } catch {
    return undefined;
  }
}

/**
 * Replace one row of a stored summary with what a retry did.
 *
 * In place, so the summary keeps its shape: a row that succeeds on the second go
 * moves from "Needs you" into "Filled" and the header's count follows, rather than a
 * second card appearing below the first saying one field went in.
 *
 * The totals are recounted rather than adjusted, because a retry can move a row
 * between any two statuses and arithmetic on five counters is a bug waiting for the
 * one case nobody thought of.
 */
export async function mergeRetry(
  tabId: number,
  turnRef: string,
  result: ActionResult,
): Promise<void> {
  const turn = (await getTurns(tabId)).find((entry) => entry.id === turnRef);
  if (turn?.role !== "copilot" || !turn.run) return;

  const { report } = turn.run;
  const results = report.results.map((entry) =>
    entry.actionId === result.actionId ? result : entry,
  );

  await patchTurn(tabId, turnRef, {
    run: {
      ...turn.run,
      report: { ...report, results, totals: countStatuses(results) },
    },
  });
}
