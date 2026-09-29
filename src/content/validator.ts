import type { Action, FieldId } from "@/shared/actions";
import { isActionType } from "@/shared/actions";
import type { ResultReason } from "@/shared/results";
import { fieldTypeOf, isButtonLike } from "@/content/classify";
import { inspectElement } from "@/content/detector";
import { isVisible } from "@/content/dom";
import { currentGeneration, generationOf, peek } from "@/content/registry";

/**
 * The last gate. It lives here, in the browser, and not on the backend.
 *
 * The backend's guard checked this plan against a snapshot. This checks it against
 * the DOM as it is *now*, immediately before the write, and the duplication is the
 * point: between the plan and the click, a page can re-render, reveal a field, or
 * disable one, and the two checks have different information about that.
 *
 * Page text is untrusted input on its way to a model, and this — together with the
 * id registry — is the defense. An id is never "resolved" some other way when the
 * registry does not have it. There is no `querySelector` in this file and there
 * must never be one.
 *
 * Nine checks, in a fixed order, and the first failure decides the outcome. The
 * order is not cosmetic: a rejection should name the most specific true thing
 * about the element, and the cheapest checks that rule out whole categories come
 * first.
 */

/**
 * `element` on a refusal is the element that was refused, when there was one.
 *
 * It is there so the overlay can put an amber box on the field the user now has to
 * handle themselves. A refusal that never found an element — an id from another
 * read, an element torn out of the page — has nothing to point at and says so.
 */
export type Validation =
  | { ok: true; element: Element }
  | { ok: false; reason: ResultReason; element?: Element };

/**
 * The one action that addresses no element.
 *
 * `explain` is not one of these. It touches nothing either, but it names a field,
 * and checking that the field is still there is worth doing before the panel goes
 * and explains it.
 */
export function isPageless(action: Action): action is Extract<Action, { type: "pause" }> {
  return action.type === "pause";
}

export function validateAction(action: Action): Validation {
  // 1. In the allowlist. A type the schema does not have never reaches an element.
  if (!isActionType(action.type)) return { ok: false, reason: "MALFORMED" };
  if (action.type === "pause") return { ok: false, reason: "MALFORMED" };

  const resolved = resolve(action.fieldId);
  if (!resolved.ok) return resolved;

  const { element } = resolved;
  const refuse = (reason: ResultReason): Validation => ({ ok: false, reason, element });

  // 4. On screen and not collapsed to nothing. A box with no size is a box the
  //    user cannot see us fill, and filling it is how a value lands somewhere
  //    nobody looks.
  if (!isVisible(element) || !hasSize(element)) return refuse("NOT_VISIBLE");

  // 5. Accepting input at all. Checked before the detector only because a disabled
  //    password field is still better described as disabled.
  if (!isWritable(element, action.type)) return refuse("NOT_WRITABLE");

  // 6. The detector, again, now. This is the check that cannot be reordered: it
  //    runs after the element is known to be real and before anything is written.
  if (inspectElement(element)) return refuse("SENSITIVE_FIELD");

  // 7 and 8. What kind of control this actually is.
  const shape = checkShape(action, element);
  if (shape) return refuse(shape);

  // 9. A select is only ever set to an option it really has.
  if (action.type === "select" && !hasOption(element, action.value)) {
    return refuse("BAD_OPTION");
  }

  return { ok: true, element };
}

/**
 * 2 and 3 — the id, and whether it still points at something in the page.
 *
 * Three outcomes, and telling them apart is the whole reason `peek` exists.
 * `UNKNOWN_FIELD` means the id is from another read or was never ours, and the
 * answer is to re-plan. `DETACHED` means it was ours and the page has since torn
 * the element out, and the answer is to re-read. A single "not found" would hide
 * which of those happened from the only person who could act on it.
 */
function resolve(fieldId: FieldId): Validation {
  if (generationOf(fieldId) !== currentGeneration()) {
    return { ok: false, reason: "UNKNOWN_FIELD" };
  }

  const element = peek(fieldId);
  if (!element) return { ok: false, reason: "UNKNOWN_FIELD" };
  if (!element.isConnected) return { ok: false, reason: "DETACHED" };

  return { ok: true, element };
}

/**
 * Does this element agree with what the action wants to do to it?
 *
 * The spec lists `WRONG_TYPE` before `MANUAL_FIELD`, and both orders are wrong on
 * their own: a `div` with `role="combobox"` is not a native control, so a strict
 * type check would call it `WRONG_TYPE` and `MANUAL_FIELD` would never fire for
 * the case it was written for. So the question is asked in two parts — is this a
 * native control at all, and if it is not, is it a widget standing in for one.
 * A native control wearing combobox clothing (the autocomplete pattern) is caught
 * by the second half.
 */
function checkShape(
  action: Exclude<Action, { type: "pause" }>,
  element: Element,
): ResultReason | undefined {
  if (action.type === "highlight" || action.type === "scroll" || action.type === "explain") {
    // These write nothing, so any element will do.
    return undefined;
  }

  if (action.type === "clickSafe") {
    return isButtonLike(element) ? undefined : "WRONG_TYPE";
  }

  const fieldType = fieldTypeOf(element);

  if (!fieldType) return isCustomWidget(element) ? "MANUAL_FIELD" : "WRONG_TYPE";
  if (!agrees(action.type, element, fieldType)) return "WRONG_TYPE";
  if (isCustomWidget(element)) return "MANUAL_FIELD";

  return undefined;
}

/** Field types a `fill` may be written into. `select` and the tick boxes have their own action. */
const FILLABLE_TYPES = new Set(["text", "email", "tel", "url", "search", "number", "date", "textarea"]);

function agrees(type: "fill" | "select" | "check", element: Element, fieldType: string): boolean {
  switch (type) {
    case "fill":
      return FILLABLE_TYPES.has(fieldType);
    case "select":
      return element.tagName === "SELECT";
    case "check":
      return fieldType === "checkbox" || fieldType === "radio";
  }
}

/**
 * A widget pretending to be a field.
 *
 * These are refused, not driven. Simulating a click sequence through someone's
 * autocomplete is unreliable on a good day, and on a bad one it selects the option
 * under the cursor rather than the one we meant — on a government form, silently.
 * The user is told to pick it themselves, which is honest and takes them four
 * seconds.
 */
const WIDGET_ROLES = new Set(["combobox", "listbox", "menu", "tree", "grid", "spinbutton"]);

export function isCustomWidget(element: Element): boolean {
  const role = element.getAttribute("role")?.toLowerCase();
  if (role && WIDGET_ROLES.has(role)) {
    // A native `<select>` may carry `role="combobox"` redundantly and is still a
    // `<select>`; a `<div>` with the same role is not.
    return element.tagName !== "SELECT";
  }

  const popup = element.getAttribute("aria-haspopup");
  if (popup && popup !== "false") return true;

  // An element that owns or controls a list it pops up is driving its own widget,
  // whatever it calls itself.
  return element.hasAttribute("aria-owns") && element.hasAttribute("aria-expanded");
}

/**
 * Not disabled, not read-only.
 *
 * `:disabled` rather than the attribute, because a control inside a disabled
 * `<fieldset>` carries neither the attribute nor the property and is just as
 * unwritable. A read-only checkbox is not a thing the platform has, so the
 * read-only half only applies to what can hold text.
 */
function isWritable(element: Element, type: string): boolean {
  if (element.matches(":disabled")) return false;
  if (type === "clickSafe" || type === "check") return true;

  return !(element as Partial<HTMLInputElement>).readOnly;
}

function hasSize(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Does this select really have that option?
 *
 * Read off the live element, never off the snapshot the plan was built from: a
 * portal that repopulates a State list when you pick a Country is the exact case
 * where a snapshot's options are a page old.
 */
function hasOption(element: Element, value: string): boolean {
  if (!(element instanceof HTMLSelectElement)) return false;

  return [...element.options].some((option) => option.value === value);
}
