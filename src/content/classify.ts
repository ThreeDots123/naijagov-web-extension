import type { FieldType } from "@/shared/page";
import { accessibleName, elementText } from "@/content/dom";

/**
 * What kind of thing is this element?
 *
 * Shared by the serializer and the detector so the two cannot disagree about
 * what counts as a field — a button the serializer treats as a field and the
 * detector treats as a button is a gap in the guard.
 */

/** `<input type>` values that are buttons wearing an input's clothes. */
const BUTTON_INPUT_TYPES = new Set(["submit", "button", "image", "reset"]);

const INPUT_FIELD_TYPES: Record<string, FieldType> = {
  text: "text",
  email: "email",
  tel: "tel",
  url: "url",
  search: "search",
  number: "number",
  password: "password",
  checkbox: "checkbox",
  radio: "radio",
  file: "file",
  date: "date",
  "datetime-local": "date",
  month: "date",
  week: "date",
  time: "date",
};

/** The `type` of an input, lowercased, defaulting the way the platform does. */
export function inputType(element: Element): string {
  return (element.getAttribute("type") ?? "text").toLowerCase();
}

/**
 * The field type to serialize this element as, or `undefined` if it is not a
 * field we collect.
 *
 * Deliberately narrow: a `range` or a `color` input is a field, but nothing in
 * the MVP knows how to explain or fill one, and a snapshot that lists something
 * the executor cannot act on only invites a plan that gets rejected.
 */
export function fieldTypeOf(element: Element): FieldType | undefined {
  switch (element.tagName) {
    case "SELECT":
      return "select";
    case "TEXTAREA":
      return "textarea";
    case "INPUT":
      return INPUT_FIELD_TYPES[inputType(element)];
    default:
      return undefined;
  }
}

export function isButtonLike(element: Element): boolean {
  if (element.tagName === "BUTTON") return true;
  if (element.tagName === "INPUT") return BUTTON_INPUT_TYPES.has(inputType(element));
  return element.tagName === "A" && element.getAttribute("role") === "button";
}

/**
 * A button's visible text, falling back to its accessible name.
 *
 * For an `<input>` button the caption is the `value` *attribute* — read as an
 * attribute rather than through the `value` property, so that nothing in this
 * file can ever be pointed at a text field and come back with what the user typed.
 */
export function buttonText(element: Element): string {
  if (element.tagName === "INPUT") {
    const caption =
      inputType(element) === "image"
        ? element.getAttribute("alt")
        : element.getAttribute("value");
    return caption?.trim() ?? accessibleName(element);
  }

  return elementText(element) || accessibleName(element);
}

/** `contenteditable` regions are out of scope for the MVP, but worth counting. */
export function isContentEditable(element: Element): boolean {
  const attribute = element.getAttribute("contenteditable");
  return attribute === "" || attribute === "true" || attribute === "plaintext-only";
}

/** The form this element belongs to, including one it is bound to by `form=`. */
export function owningForm(element: Element): HTMLFormElement | undefined {
  if ("form" in element) {
    const form = (element as { form?: unknown }).form;
    if (form instanceof HTMLFormElement) return form;
  }

  return element.closest("form") ?? undefined;
}
