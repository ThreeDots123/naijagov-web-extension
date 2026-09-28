import type { SystemTurn } from "@/shared/chat";
import { turnId } from "@/shared/chat";
import type { PlanReadyMessage } from "@/shared/messages";
import type { Plan, PlanError } from "@/shared/plan";
import { isPlanErrorCode } from "@/shared/plan";
import { ApiError, postPlan } from "@/sw/api";
import { appendTurn } from "@/sw/chat";
import { clearContext, ensureContext } from "@/sw/context";
import { fetchSnapshot, raiseCheckpoint } from "@/sw/page";
import { toPlanRequest } from "@/sw/payload";
import { isFillableRow } from "@/sw/plan-actions";
import { reread } from "@/sw/plan-page";
import { setSession, setState } from "@/sw/session";

/**
 * A turn, from the user's message to a preview waiting for approval.
 *
 * The fragment ends at approval. What happens to the approved actions is the
 * executor's, and this hands them over by writing them to `pendingActions` and
 * moving the tab to `EXECUTING` — the state the spec puts the handoff in.
 *
 * Every failure becomes a **system note** in the transcript rather than a Copilot
 * turn. The Copilot saying "I can't reach the assistant" would be the Copilot
 * claiming to have spoken when it never ran.
 */

/** Our own sentences, for the failures no backend can describe. */
const UNPARSEABLE = "I couldn't put that into a plan. Try rephrasing?";
const NO_CONNECTION = "I can't reach the assistant. Check your connection.";
const NO_CONTEXT = "I couldn't work out what this page is asking for. Try reloading it.";

/**
 * A failure while establishing the page's session, rather than while planning.
 *
 * It exists so the two cannot be confused in what the user is told. They were, once:
 * an unparseable `/context` response was reported as "I couldn't put that into a plan.
 * Try rephrasing?", which sent everyone looking at the wrong half of the system — the
 * message had nothing to do with the message they sent.
 */
class ContextFailure extends Error {
  constructor(cause: unknown) {
    // The native `cause` option, rather than a field of our own, which would have to
    // shadow `Error`'s.
    super("Establishing the page context failed.", { cause });
    this.name = "ContextFailure";
  }
}

/**
 * A thrown anything, as a code the panel can branch on and a sentence it can print.
 *
 * The backend's own message is preferred wherever there is one: their sentences are
 * written for someone who has already lost a morning to a portal, and the panel must
 * not improvise a technical explanation over the top of one.
 */
function toPlanError(error: unknown): PlanError {
  // `/context` failing is still worth the backend's own sentence when it sent one —
  // `UNAUTHENTICATED` and `RATE_LIMITED` read the same whichever call hit them. Only
  // the *unparseable* case needs wording of its own, because that is the case where
  // the planning sentence would be a lie.
  if (error instanceof ContextFailure) {
    const inner = toPlanError(error.cause);

    return inner.message === UNPARSEABLE ? { code: inner.code, message: NO_CONTEXT } : inner;
  }

  if (error instanceof ApiError) {
    if (error.isOffline) return { code: "OFFLINE", message: NO_CONNECTION };

    return {
      code: isPlanErrorCode(error.code) ? error.code : "INTERNAL",
      message: error.message,
      ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
    };
  }

  // A response that did not parse. Loud, and never a partial preview: half a plan on
  // screen is a set of fills the user would approve without having been shown them all.
  if (error instanceof Error && error.name === "ZodError") {
    return { code: "PLAN_FAILED", message: UNPARSEABLE };
  }

  // Everything local — the content script not answering, most often. Its own message
  // is already written for the user.
  return {
    code: "INTERNAL",
    message: error instanceof Error ? error.message : UNPARSEABLE,
  };
}

function systemTurn(error: PlanError, retryMessage: string): SystemTurn {
  return {
    id: turnId(),
    role: "system",
    code: error.code,
    text: error.message,
    at: Date.now(),
    retryMessage,
    ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
  };
}

/**
 * Plan a turn.
 *
 * Answered only when it is over, which can be twenty seconds: the pending response
 * is what keeps the service worker alive across the model call. The outcome is
 * written to the transcript before this resolves either way, so a panel closed
 * mid-turn finds the answer waiting instead of losing it.
 */
export async function requestPlan(tabId: number, message: string): Promise<PlanReadyMessage> {
  await appendTurn(tabId, { id: turnId(), role: "user", text: message, at: Date.now() });
  await setState(tabId, "PLANNING");

  try {
    const snapshot = await fetchSnapshot(tabId);

    // A CAPTCHA or a payment frame appeared. Stop, and do not spend a model call on a
    // page whose next step is not ours to take.
    if (snapshot.checkpoint.blocking) {
      const blocker = snapshot.sensitiveFlags.find(
        (flag) => flag.kind === "captcha" || flag.kind === "payment",
      );
      await raiseCheckpoint(
        tabId,
        blocker?.reason ?? "This page needs you to take over.",
        blocker?.fieldId,
      );

      return { type: "PLAN_READY" };
    }

    // Tagged separately so a failure here cannot be reported as a planning failure.
    // The two steps fail for different reasons and deserve different advice: "try
    // rephrasing" is useless when the page could not be identified in the first place.
    const context = await ensureContext(tabId, snapshot).catch((error: unknown) => {
      throw new ContextFailure(error);
    });

    const plan = await postPlan(
      toPlanRequest({
        snapshot,
        sessionId: context.sessionId,
        serverPageHash: context.serverPageHash,
        message,
        clientPlanId: turnId(),
      }),
    );

    await recordPlan(tabId, plan, snapshot.pageHash);
  } catch (error) {
    await recordFailure(tabId, toPlanError(error), message);
  }

  return { type: "PLAN_READY" };
}

/**
 * The plan, as a Copilot turn.
 *
 * `pending` only when there is something to approve. A reply that proposed no fills
 * is still a reply, and its blocked rows, its unanswered questions and its sources
 * all still belong on screen — but a card headed "I can fill 0 of 0 fields" with an
 * approve button is a gate in front of an empty room.
 */
async function recordPlan(tabId: number, plan: Plan, localPageHash: string): Promise<void> {
  const fillable = plan.actions.filter(isFillableRow).length;
  const id = turnId();

  await appendTurn(tabId, {
    id,
    role: "copilot",
    text: plan.reply,
    at: Date.now(),
    plan,
    ...(fillable > 0 ? { status: "pending" as const } : {}),
  });

  if (fillable === 0) {
    await setSession(tabId, { pendingPlan: undefined });
    await setState(tabId, "READY");

    return;
  }

  await setSession(tabId, {
    pendingPlan: { planId: plan.planId, turnId: id, localPageHash },
  });
  await setState(tabId, "AWAITING_CONFIRMATION");
}

/**
 * A failed turn.
 *
 * `PAGE_CHANGED` re-reads the page on the user's behalf and then stops: the spec is
 * explicit that it must not silently re-plan, because by the time they look again
 * they may want to ask something different.
 *
 * Every other code returns the tab to `READY`. That includes `SESSION_BUSY`, where
 * the spec asks for the composer to stay disabled — honoured literally it would
 * strand the user, because the turn holding the backend's lock is one whose response
 * we have already lost. They are told what happened and left able to try again.
 */
async function recordFailure(
  tabId: number,
  error: PlanError,
  retryMessage: string,
): Promise<void> {
  await appendTurn(tabId, systemTurn(error, retryMessage));

  if (error.code === "PAGE_CHANGED") {
    await clearContext(tabId);
    await reread(tabId);

    return;
  }

  await setState(tabId, "READY");
}
