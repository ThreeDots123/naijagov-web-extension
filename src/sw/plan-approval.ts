import type { Turn } from "@/shared/chat";
import { turnId } from "@/shared/chat";
import type { ApprovedRow, PlanApprovedMessage, PlanCancelledMessage } from "@/shared/messages";
import { appendTurn, getTurns, patchTurn } from "@/sw/chat";
import { clearContext } from "@/sw/context";
import { fetchPageHash } from "@/sw/page";
import { buildActions } from "@/sw/plan-actions";
import { getSession, setSession, setState } from "@/sw/session";
import { reread } from "@/sw/plan-page";

/**
 * Approval, and the checks that stand between it and the page.
 *
 * Split from `plan.ts` so each side stays readable: that file turns a message into a
 * plan, this one turns a plan into actions. They share the page-reading helper rather
 * than one importing the other, which keeps the dependency a line instead of a circle.
 */

/**
 * `Fill selected`.
 *
 * The hash is re-checked here and not only at planning, because the preview may have
 * been open for minutes. A page that moved in that time is a page the plan was not
 * built for, and applying it anyway is how a value lands in the wrong box.
 */
export async function approvePlan(
  tabId: number,
  approvedTurnId: string,
  rows: readonly ApprovedRow[],
): Promise<PlanApprovedMessage> {
  const session = await getSession(tabId);
  const pending = session.pendingPlan;

  if (!pending || pending.turnId !== approvedTurnId) {
    // Nothing to approve: a checkpoint cancelled it, or this panel is looking at a
    // turn the worker has already moved past.
    return { type: "PLAN_APPROVED", outcome: "stale", dispatched: 0 };
  }

  const live = await fetchPageHash(tabId);

  if (live.pageHash !== pending.localPageHash) {
    await discard(tabId, approvedTurnId);

    return { type: "PLAN_APPROVED", outcome: "stale", dispatched: 0 };
  }

  const turn = (await getTurns(tabId)).find((entry) => entry.id === approvedTurnId);
  const plan = turn?.role === "copilot" ? turn.plan : undefined;

  if (!plan) {
    await discard(tabId, approvedTurnId);

    return { type: "PLAN_APPROVED", outcome: "stale", dispatched: 0 };
  }

  const { actions } = buildActions(plan, rows);

  await setSession(tabId, { pendingActions: actions, pendingPlan: undefined });
  await patchTurn(tabId, approvedTurnId, {
    status: "approved",
    approvedCount: actions.length,
  });

  // Where this fragment ends. The actions are handed over; running them, reading them
  // back and reporting them is the executor's, and it starts from here.
  await setState(tabId, "EXECUTING");

  return { type: "PLAN_APPROVED", outcome: "dispatched", dispatched: actions.length };
}

/** The page moved, or the plan is gone. Discard it and read the page again. */
async function discard(tabId: number, staleTurnId: string): Promise<void> {
  await patchTurn(tabId, staleTurnId, { status: "stale" });
  await setSession(tabId, { pendingPlan: undefined, pendingActions: [] });
  await appendTurn(tabId, {
    id: turnId(),
    role: "system",
    code: "PAGE_CHANGED",
    text: "The page changed while we were talking — let me read it again.",
    at: Date.now(),
  } satisfies Turn);

  await clearContext(tabId);
  await reread(tabId);
}

/** `Cancel`. The card collapses, nothing is sent, and the turn stays in the transcript. */
export async function cancelPlan(
  tabId: number,
  cancelledTurnId: string,
): Promise<PlanCancelledMessage> {
  await patchTurn(tabId, cancelledTurnId, { status: "cancelled" });
  await setSession(tabId, { pendingPlan: undefined, pendingActions: [] });
  await setState(tabId, "READY");

  return { type: "PLAN_CANCELLED" };
}
