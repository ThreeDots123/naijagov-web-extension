import type { Action, ActionResult } from "@/shared/actions";
import type { ValidationContext } from "@/content/validator";

/**
 * Runs cleared actions against the page.
 *
 * Not implemented yet. The signature is the contract.
 *
 * How a fill has to work when this is built:
 *
 *  1. Re-check the action with the validator and the detector. The page may have
 *     changed since it was planned.
 *  2. Write through the element's **native value setter**, so a React or Vue
 *     controlled input actually notices.
 *  3. Dispatch `input` and `change`, both with `bubbles: true`.
 *  4. Read the value back. A fill that does not read back is a `failed` fill,
 *     shown amber — not a success.
 *
 * Results carry field ids and statuses. Never a value, in a log or anywhere else.
 */

export function executeAction(action: Action, context: ValidationContext): Promise<ActionResult> {
  throw new Error("executeAction is not implemented yet.");
}

/**
 * Run a batch one at a time, stopping the moment the detector fires.
 *
 * Sequential on purpose: each action is re-checked against the page as it is
 * *now*, and an earlier fill can change what a later field contains.
 */
export function executeActions(
  actions: readonly Action[],
  context: ValidationContext,
): Promise<ActionResult[]> {
  throw new Error("executeActions is not implemented yet.");
}
