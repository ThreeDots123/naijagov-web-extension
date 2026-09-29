/**
 * The action contract.
 *
 * This is the set of things the backend is allowed to ask the browser to do.
 * naijagov-api mirrors this file. Changing it is a two-repo change — widening it
 * on one side only produces actions the validator will reject, which is the
 * failure mode we want, but it is still a bug.
 *
 * Two properties matter more than any individual action:
 *
 *  1. Every action addresses an element by `fieldId` — an id minted by our
 *     serializer and held in its registry. The model never supplies a selector.
 *     There is nowhere in this type to put one.
 *  2. Anything that writes a value carries a `ValueSource`. A value with no
 *     traceable origin is a value the model invented, and the validator drops it.
 *
 * What *came back* from a run lives in `results.ts`, not here. That separation is
 * deliberate: this file carries values down to the page, and nothing in that file
 * has anywhere to carry one back up.
 */

/** An id minted by the serializer, e.g. "g4-f12". Never a selector, never a name. */
export type FieldId = string;

/**
 * What every action carries.
 *
 * `actionId` is the positional id the backend minted for the plan row this came
 * from (`a1`, `a2`). It travels down to the page and back up in the result, which
 * is how a result is matched to the row the user actually ticked — `fieldId` will
 * not do, because one field can be both highlighted and filled in a single plan.
 */
export interface ActionBase {
  actionId: string;
}

/**
 * Where a written value came from.
 *
 * - `profile` — the user's saved profile, `key` naming the field it came from
 * - `chat`    — something the user typed to the Copilot in this session
 * - `user`    — something the user typed directly into the confirmation UI
 *
 * There is deliberately no `model` or `inferred` kind. If a value cannot claim
 * one of these three origins, it does not get filled.
 */
export type ValueSource =
  | { kind: "profile"; key: string }
  | { kind: "chat" }
  | { kind: "user" };

/** Set a text-like input's value. */
export interface FillAction extends ActionBase {
  type: "fill";
  fieldId: FieldId;
  value: string;
  source: ValueSource;
}

/** Choose an option in a `<select>`. The value must exist among the real options. */
export interface SelectAction extends ActionBase {
  type: "select";
  fieldId: FieldId;
  value: string;
  source: ValueSource;
}

/** Tick or untick a checkbox. */
export interface CheckAction extends ActionBase {
  type: "check";
  fieldId: FieldId;
  checked: boolean;
  source: ValueSource;
}

/** Draw attention to an element. Touches nothing. */
export interface HighlightAction extends ActionBase {
  type: "highlight";
  fieldId: FieldId;
}

/** Bring an element into view. Touches nothing. */
export interface ScrollAction extends ActionBase {
  type: "scroll";
  fieldId: FieldId;
}

/** Ask the panel to explain an element. Touches nothing on the page. */
export interface ExplainAction extends ActionBase {
  type: "explain";
  fieldId: FieldId;
}

/**
 * Click a button the detector has cleared.
 *
 * Never a submit, pay, confirm, authorize or verify button. In the MVP even
 * "Continue" is the user's own click, because on some portals Continue submits.
 */
export interface ClickSafeAction extends ActionBase {
  type: "clickSafe";
  fieldId: FieldId;
}

/** Stop and hand back to the user. `reason` is shown to them verbatim. */
export interface PauseAction extends ActionBase {
  type: "pause";
  reason: string;
}

export type Action =
  | FillAction
  | SelectAction
  | CheckAction
  | HighlightAction
  | ScrollAction
  | ExplainAction
  | ClickSafeAction
  | PauseAction;

/**
 * The validator's allowlist.
 *
 * `satisfies` stops a type being listed here that has no variant above; the
 * coverage check below stops a variant being added without being listed here.
 * Between them the allowlist and the union cannot drift apart.
 */
export const ACTION_TYPES = [
  "fill",
  "select",
  "check",
  "highlight",
  "scroll",
  "explain",
  "clickSafe",
  "pause",
] as const satisfies readonly Action["type"][];

export type ActionType = (typeof ACTION_TYPES)[number];

type Expect<T extends true> = T;

/** Fails the build if an `Action` variant is added but not listed in `ACTION_TYPES`. */
export type ActionTypeCoverage = Expect<
  Exclude<Action["type"], ActionType> extends never ? true : false
>;

/** The actions that write something. These are the ones that need a `ValueSource`. */
export type WriteAction = FillAction | SelectAction | CheckAction;

export function isActionType(value: unknown): value is ActionType {
  return typeof value === "string" && (ACTION_TYPES as readonly string[]).includes(value);
}

export function isWriteAction(action: Action): action is WriteAction {
  return action.type === "fill" || action.type === "select" || action.type === "check";
}


/** The element an action addresses, or nothing for a `pause`. */
export function fieldIdOf(action: Action): FieldId | undefined {
  return action.type === "pause" ? undefined : action.fieldId;
}
