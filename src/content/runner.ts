import type { Action } from "@/shared/actions";
import { fieldIdOf } from "@/shared/actions";
import { broadcast } from "@/shared/messages";
import type { SensitiveFlag } from "@/shared/page";
import type { ActionResult, ActionStatus, RunReport } from "@/shared/results";
import { ACTION_PAUSE_MS, BATCH_TIMEOUT_MS, MAX_BATCH_ACTIONS } from "@/shared/results";
import { detectBlocking } from "@/content/detector";
import { executeAction } from "@/content/executor";
import { clearHighlights, highlight, highlightField } from "@/content/overlay";
import { currentGeneration, generationOf } from "@/content/registry";
import type { Stop } from "@/content/run-report";
import { buildReport, cancelFrom, fieldPart, rejectAll } from "@/content/run-report";
import { isPageless, validateAction } from "@/content/validator";

/**
 * The loop that drives a batch.
 *
 * It is the only code in the product that changes a government form, and almost
 * all of it is about the reasons not to. Three things shape it:
 *
 * **Sequential, with a pause.** Frameworks re-render between writes, and a
 * parallel burst produces races that only show up on a slow machine — such as the
 * one the demo is given.
 *
 * **Re-checked between every action, not once.** A field that became sensitive, a
 * payment frame that appeared, a re-render that moved every id: all of those can
 * happen in the second this takes, and each one is checked again before the next
 * write rather than assumed away.
 *
 * **A rejection is not an abort.** One unfillable field must not cost the user the
 * other seven. Only four things stop a batch — a checkpoint, a page that changed
 * underneath it, a navigation, and the clock.
 */

export async function runActions(actions: readonly Action[]): Promise<RunReport> {
  const startedAt = Date.now();

  // A new batch owns the overlay. Boxes left from the last run would claim a green
  // tick for work that is not being done again.
  clearHighlights();

  // Longer than any plan the backend will produce, so this is a contract
  // disagreement rather than a page problem. Refused whole, and each action says
  // why, because a truncated batch is a batch the user did not approve.
  if (actions.length > MAX_BATCH_ACTIONS) {
    return report(rejectAll(actions, "MALFORMED"), {}, 0, startedAt);
  }

  const preflight = checkPreflight(actions);
  if (preflight) {
    return report(cancelFrom(actions, 0, preflight), preflight, 0, startedAt);
  }

  const deadline = startedAt + BATCH_TIMEOUT_MS;
  const url = location.href;
  const done: ActionResult[] = [];

  for (const [index, action] of actions.entries()) {
    // Not on the first pass: pre-flight has just asked all three of these
    // questions, and a second full detector sweep costs the batch its budget.
    const stop = index === 0 ? undefined : checkStop(deadline, url);
    if (stop) {
      return report([...done, ...cancelFrom(actions, index, stop)], stop, index, startedAt);
    }

    done.push(await runOne(action, index, actions.length));

    // A `pause` is the plan telling the user to take over. Everything after it was
    // planned on the assumption that they would, so none of it runs.
    if (action.type === "pause") {
      return report([...done, ...cancelFrom(actions, index + 1, {})], {}, index, startedAt);
    }

    if (index < actions.length - 1) await wait(ACTION_PAUSE_MS);
  }

  return report(done, {}, actions.length, startedAt);
}

/**
 * Section 1, before anything is touched.
 *
 * The generation is read off the action ids themselves rather than carried beside
 * them, so the number and the ids it describes cannot disagree. A mismatch aborts
 * the whole batch and not each action in turn: if the page was re-read since the
 * plan was made, no action in that plan is trusted, and applying half of one to a
 * page that has moved is worse than applying none of it.
 */
function checkPreflight(actions: readonly Action[]): Stop | undefined {
  const planned = actions.map(fieldIdOf).find((id): id is string => id !== undefined);

  if (planned !== undefined && generationOf(planned) !== currentGeneration()) {
    return { aborted: "stale_page" };
  }

  const blocking = detectBlocking();
  return blocking ? { checkpoint: blocking } : undefined;
}

/**
 * Between every action: is there still a page to write to, and may we?
 *
 * The URL comparison catches a navigation the content script has not been torn
 * down for yet — a same-document route change, or the moment between a click and
 * the unload. The generation is not re-checked here; the validator checks it per
 * action, and a re-render that invalidated one id has invalidated all of them, so
 * the batch ends up rejecting the rest either way with a more specific reason.
 */
function checkStop(deadline: number, url: string): Stop | undefined {
  if (Date.now() > deadline) return { aborted: "timeout" };
  if (location.href !== url) return { aborted: "navigated" };

  const blocking = detectBlocking();
  return blocking ? { checkpoint: blocking } : undefined;
}

async function runOne(action: Action, index: number, total: number): Promise<ActionResult> {
  const { result, element } = await decide(action);

  if (element) paint(element, result.status);

  // Nobody has to be listening. The run does not wait on this and never blocks on
  // a reply — the overlay is the feedback that matters, because the user is
  // watching the form and not the panel.
  void broadcast({ type: "ACTION_PROGRESS", index, total, result });

  return result;
}

async function decide(action: Action): Promise<{ result: ActionResult; element?: Element }> {
  const base = { actionId: action.actionId, ...fieldPart(action) };

  // A pause addresses no element, so there is nothing to validate and nothing to
  // do but stop. It did what it says on the tin.
  if (isPageless(action)) return { result: { ...base, status: "ok" } };

  const validation = validateAction(action);

  if (!validation.ok) {
    return {
      result: { ...base, status: "rejected", reason: validation.reason },
      // Present when the element was found and refused for what it is — so the
      // user can see *which* field they have to deal with themselves.
      ...(validation.element ? { element: validation.element } : {}),
    };
  }

  // The target pulses amber while it is being written, so the user's eye is on the
  // field at the moment it changes. It is also the honest order: show what is
  // about to be touched before touching it.
  highlight(validation.element, "needs-input");

  const outcome = await executeAction(action, validation.element);

  return { result: { ...base, ...outcome }, element: validation.element };
}

/**
 * Section 6.
 *
 * Green for a value that read back, amber for everything the user still has to
 * deal with. Amber is `needs-input`, the one state that moves — which is right for
 * both the field being written and the field that refused: in each case the next
 * thing to happen there involves the person.
 */
function paint(element: Element, status: ActionStatus): void {
  highlight(element, status === "ok" || status === "changed" ? "filled" : "needs-input");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The report, plus the one side effect that belongs with it.
 *
 * Painting the page red happens here rather than where the checkpoint was found,
 * so that every path out of the loop paints it exactly once.
 */
function report(
  results: readonly ActionResult[],
  stop: Stop,
  afterIndex: number,
  startedAt: number,
): RunReport {
  if (stop.checkpoint) paintCheckpoint(stop.checkpoint);

  return buildReport(results, stop, afterIndex, startedAt);
}

/**
 * The page-level red state.
 *
 * Everything pending is cleared first: a batch that stopped at a payment frame must
 * not leave amber boxes implying it is still working through the form. The box goes
 * through the registry like every other one — a checkpoint is not a reason to start
 * resolving ids some other way.
 */
function paintCheckpoint(flag: SensitiveFlag): void {
  clearHighlights();
  if (flag.fieldId) highlightField(flag.fieldId, "checkpoint");
}

