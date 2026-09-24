import type { Action } from "@/shared/actions";
import type { SensitiveFlag } from "@/shared/page";
import type { FieldRegistry } from "@/content/serializer";

/**
 * The last gate. It lives here, in the browser, and not on the backend.
 *
 * Not implemented yet. The signature is the contract: a pure function over an
 * action and the current page facts.
 *
 * Page text is untrusted input on its way to a model, and this — together with
 * the id registry — is the defense. Neither may be loosened for convenience.
 *
 * What every action has to clear when this is built:
 *
 *  - its type is in `ACTION_TYPES`
 *  - its `fieldId` is in the *current* registry — never resolved any other way
 *  - the element is still attached and still visible
 *  - the detector has not flagged it
 *  - for a select, the value exists among the element's real options
 *  - for anything that writes, the `ValueSource` traces to the profile or to
 *    something the user typed
 *
 * A rejected action is reported back with a reason. It is never silently dropped.
 */

export interface ValidationContext {
  registry: FieldRegistry;
  flags: readonly SensitiveFlag[];
}

export type ValidationResult =
  | { ok: true; action: Action; element?: Element }
  | { ok: false; action: Action; reason: string };

export function validateAction(action: Action, context: ValidationContext): ValidationResult {
  throw new Error("validateAction is not implemented yet.");
}

export function validateActions(
  actions: readonly Action[],
  context: ValidationContext,
): ValidationResult[] {
  throw new Error("validateActions is not implemented yet.");
}
