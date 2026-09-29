import { turnId } from "@/shared/chat";
import type { CheckpointCancelledMessage, CheckpointResumedMessage } from "@/shared/messages";
import { appendTurn } from "@/sw/chat";
import { blockerOf, fetchSnapshot, raiseCheckpoint, receiveSnapshot } from "@/sw/page";
import { getSession, setSession, setState } from "@/sw/session";

/**
 * Leaving a checkpoint.
 *
 * The state machine's one irreversible rule is that nothing moves a tab out of
 * `CHECKPOINT` except the user choosing to. This file is that choice, and it is the
 * only code that may clear one.
 *
 * Both exits re-read nothing they do not have to and neither resumes anything.
 * "I've done it" triggers a **fresh read**, always: completing a verification step
 * usually changes the page, and carrying on with a plan built against the page as it
 * was is how a value lands in the wrong box. "Cancel this plan" sends nothing at all
 * — the actions were already thrown away when the checkpoint was raised, so there is
 * nothing to stop, only a banner to put away.
 */

const RESUMED_NOTE = "Picking up from where we left off.";
const NAVIGATED_NOTE = "New page — let me take a look.";
const CANCELLED_NOTE = "Plan cancelled. Nothing further was sent to the page.";

/** Everything the banner is drawn from, cleared in one write. */
const NO_CHECKPOINT = {
  checkpointReason: undefined,
  checkpointKind: undefined,
  checkpointCancelled: 0,
  checkpointUnfinished: false,
} as const;

/**
 * `I've done it — continue`.
 *
 * The checkpoint is cleared *before* the read rather than after it, because
 * `receiveSnapshot` refuses to move a tab that is still at `CHECKPOINT` — that guard
 * is what stops a page mutation from dismissing a banner on its own, and this is the
 * one caller entitled to step around it.
 *
 * Four outcomes, and only one of them is a failure:
 *
 *  - **clear** — nothing blocking. The banner goes, the transcript gains a quiet line.
 *  - **unfinished** — the same page, still gated. The banner returns in softer
 *    wording, because a person part-way through reading an SMS is not doing anything
 *    wrong and a counter climbing at them would say otherwise.
 *  - **navigated** — a different page. Treated as new, whatever it turns out to hold.
 *  - **unreachable** — no content script answered. The banner is restored rather
 *    than dropped: a page we cannot read is not a page we can say is safe.
 */
export async function continueFromCheckpoint(
  tabId: number,
): Promise<CheckpointResumedMessage> {
  const before = await getSession(tabId);

  if (before.state !== "CHECKPOINT") return { type: "CHECKPOINT_RESUMED", outcome: "clear" };

  await setSession(tabId, NO_CHECKPOINT);
  await setState(tabId, "READING");

  let snapshot;
  try {
    snapshot = await fetchSnapshot(tabId);
  } catch {
    await raiseCheckpoint(
      tabId,
      {
        kind: before.checkpointKind ?? "unknown",
        reason: before.checkpointReason ?? "This page needs you to take over.",
      },
      { cancelled: before.checkpointCancelled ?? 0 },
    );

    return { type: "CHECKPOINT_RESUMED", outcome: "unreachable" };
  }

  const navigated = before.pageHash !== undefined && snapshot.pageHash !== before.pageHash;

  // Still gated, and the page has not moved: the step is simply not finished. Said in
  // softer words, with the cancelled count dropped — those were reported once already
  // and repeating them would read as a new loss each time.
  if (snapshot.checkpoint.blocking && !navigated) {
    await raiseCheckpoint(tabId, blockerOf(snapshot), { cancelled: 0, unfinished: true });

    return { type: "CHECKPOINT_RESUMED", outcome: "unfinished" };
  }

  // Everything else is an ordinary read, including a new page that turns out to be
  // gated too — that is a checkpoint about the new page, not a step left undone.
  await receiveSnapshot(snapshot, tabId);

  await appendTurn(tabId, {
    id: turnId(),
    role: "system",
    text: navigated ? NAVIGATED_NOTE : RESUMED_NOTE,
    at: Date.now(),
  });

  return { type: "CHECKPOINT_RESUMED", outcome: navigated ? "navigated" : "clear" };
}

/**
 * `Cancel this plan`.
 *
 * Nothing is sent. The pending actions went when the checkpoint was raised, so this
 * puts the banner away and leaves the line in the transcript that says the plan is
 * over — the user should be able to scroll back and see that it was their decision.
 */
export async function cancelCheckpoint(tabId: number): Promise<CheckpointCancelledMessage> {
  await setSession(tabId, { ...NO_CHECKPOINT, pendingActions: [], pendingPlan: undefined });

  await appendTurn(tabId, {
    id: turnId(),
    role: "system",
    text: CANCELLED_NOTE,
    at: Date.now(),
  });

  await setState(tabId, "READY");

  return { type: "CHECKPOINT_CANCELLED" };
}
