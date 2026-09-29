import type { Action, CheckAction, FillAction, SelectAction } from "@/shared/actions";
import type { ActionStatus, ResultReason } from "@/shared/results";
import type { Readback } from "@/content/readback";
import { readBack, settle } from "@/content/readback";
import type { Technique } from "@/content/writers";
import { alreadySatisfied, bringIntoView, write } from "@/content/writers";

/**
 * One action, from write to verdict.
 *
 * The validator has already cleared this element against the live page. What is
 * left is the writing itself and the honesty about whether it worked: write, wait,
 * read it back, and if it did not take, try the one other technique and read again.
 *
 * Nothing here throws. An element replaced by a re-render between the validator
 * and the write makes the write a no-op or makes it raise, and both have to end in
 * a result rather than in an exception that takes the other seven fields with it.
 */

export interface Outcome {
  status: ActionStatus;
  reason?: ResultReason;
}

const SUCCESS: Outcome = { status: "ok" };

type WriteAction = FillAction | SelectAction | CheckAction;

export async function executeAction(action: Action, element: Element): Promise<Outcome> {
  switch (action.type) {
    // Nothing is written, so there is nothing to read back. Successful if the
    // element is there, and the validator already established that it is.
    case "scroll":
    case "highlight":
      bringIntoView(element);
      return SUCCESS;

    // The panel explains; the page is not touched.
    case "explain":
      return SUCCESS;

    case "clickSafe":
      return clickCleared(element);

    case "fill":
    case "select":
    case "check":
      return writeAndVerify(action, element);

    // The runner handles a pause before it gets here — it is an instruction to the
    // user, not an operation on an element.
    case "pause":
      return { status: "rejected", reason: "MALFORMED" };
  }
}

/**
 * A button the detector has cleared.
 *
 * There is no read-back for a click: what it did is whatever the page decided to
 * do, which is exactly why the detector, not this function, decides whether it may
 * happen at all. In the MVP "Continue" is still the user's own click — that is the
 * plan's business, and by the time an action arrives here it has been through the
 * guard, the user's approval and the validator.
 */
function clickCleared(element: Element): Outcome {
  try {
    (element as HTMLElement).click();
    return SUCCESS;
  } catch {
    return { status: "failed", reason: "NOT_ACCEPTED" };
  }
}

async function writeAndVerify(action: WriteAction, element: Element): Promise<Outcome> {
  // A checkbox that is already how the user wants it is left alone. Clicking it
  // would turn it off, which is the one case where doing the work is the bug.
  if (action.type === "check" && alreadySatisfied(element, action)) return SUCCESS;

  bringIntoView(element);

  const first = await attempt(action, element, "primary");
  if (first !== "mismatch") return verdict(first);

  // One retry, with a genuinely different technique. Not two, and not synthetic
  // keystrokes after it: a page that has refused a value twice is telling us
  // something, and the user is better served by being told than by us trying
  // harder in ways that are increasingly unlike a person typing.
  const second = await attempt(action, element, "alternate");
  return verdict(second);
}

async function attempt(action: WriteAction, element: Element, technique: Technique): Promise<Readback> {
  try {
    write(element, action, technique);
  } catch {
    // The element was swapped out from under the write. Treated as a mismatch so
    // the retry gets its turn, and as `NOT_ACCEPTED` if that fails too.
    return "mismatch";
  }

  await settle();

  // The re-render case again: an element detached between the write and here holds
  // whatever it held, and reading it would be reading a node that is no longer part
  // of the page the user is looking at.
  if (!element.isConnected) return "mismatch";

  return readBack(element, action);
}

/**
 * `changed` carrying `NOT_ACCEPTED` is not a mistake.
 *
 * The backend requires a reason code on every status but `ok`, and the shared
 * vocabulary has one code for "the page did not take the value as written". A
 * reformatted value is that, softened by the status beside it — which is what the
 * panel actually branches on. Adding a `REFORMATTED` code would be a two-repo
 * change for a distinction the status already carries.
 */
function verdict(result: Readback): Outcome {
  if (result === "ok") return SUCCESS;
  if (result === "changed") return { status: "changed", reason: "NOT_ACCEPTED" };

  return { status: "failed", reason: "NOT_ACCEPTED" };
}
