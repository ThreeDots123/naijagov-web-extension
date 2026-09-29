import type { CheckAction, FillAction, SelectAction } from "@/shared/actions";

/**
 * Writing a value into someone else's form.
 *
 * Two rules run through everything here.
 *
 * **Never assign to `element.value`.** React — and Vue, and every other library
 * that owns an input's value — installs its own setter on the *instance* and keeps
 * a private record of what it last wrote. Assigning to the instance property
 * updates that record too, so the framework concludes nothing changed and throws
 * the write away on its next render. Taking the setter off the prototype and
 * calling it against the element writes the DOM value without touching the
 * tracker, and the `input` event that follows then looks exactly like typing.
 *
 * **Every technique has a second one.** Portals disagree about which event they
 * listen for, and one retry with a genuinely different approach turns a good
 * fraction of failures into successes. It is one retry, not an escalation: after
 * that we tell the user rather than reaching for synthetic keystrokes.
 */

/** Which of a type's two techniques to use. */
export type Technique = "primary" | "alternate";

/**
 * The property setter the platform defines, taken off the prototype.
 *
 * `Object.getPrototypeOf` rather than a named class, because the same code has to
 * work for `HTMLInputElement`, `HTMLTextAreaElement` and `HTMLSelectElement`, and
 * because a page is free to hand us a subclass.
 */
function nativeSetter(element: Element, property: "value" | "checked"): ((value: never) => void) | undefined {
  let prototype: object | null = Object.getPrototypeOf(element) as object | null;

  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor?.set) return descriptor.set.bind(element) as (value: never) => void;
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }

  return undefined;
}

function setValue(element: Element, value: string): void {
  const setter = nativeSetter(element, "value");

  // No native setter at all means this is not a control the platform knows. The
  // validator should have refused it long before here; the read-back is what
  // catches it if something slipped through, and a thrown error here would take
  // the rest of the batch with it.
  setter?.(value as never);
}

function setChecked(element: Element, checked: boolean): void {
  nativeSetter(element, "checked")?.(checked as never);
}

/** `input` then `change`, both bubbling, which is what a real edit looks like. */
function announce(element: Element, kinds: readonly string[] = ["input", "change"]): void {
  for (const kind of kinds) {
    element.dispatchEvent(new Event(kind, { bubbles: true }));
  }
}

/**
 * Bring the target into view before it changes.
 *
 * The user is watching the form, not the panel — that is the whole design of the
 * overlay — so a field that fills off-screen fills invisibly. Instant under
 * reduced motion, and instant is also what keeps a batch inside its budget.
 */
export function bringIntoView(element: Element): void {
  element.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: prefersReducedMotion() ? "instant" : "smooth",
  });
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Text inputs and textareas.
 *
 * The blur at the end is not tidiness: a great many portals validate on blur, and
 * a field left focused is a field whose error message has not appeared yet — which
 * would make the next read of the page miss it.
 */
function writeText(element: Element, action: FillAction, technique: Technique): void {
  const target = element as HTMLElement;
  target.focus();

  if (technique === "alternate") {
    // Clear first, and say so. A portal that appends rather than replaces, or one
    // that only reacts to a change *from* something, needs to see the field empty.
    setValue(element, "");
    announce(element, ["input"]);
  }

  setValue(element, action.value);
  announce(element);
  target.blur();
}

/**
 * Selects.
 *
 * The value is already known to exist among the real options — the validator
 * checked the live element, not the snapshot — so this is only about making the
 * page believe it.
 */
function writeSelect(element: Element, action: SelectAction, technique: Technique): void {
  const select = element as HTMLSelectElement;
  select.focus();

  if (technique === "primary") {
    setValue(element, action.value);
  } else {
    // Some select wrappers watch `selectedIndex` rather than the value, and some
    // re-render on `input` but not on `change`. Both are covered below.
    const index = [...select.options].findIndex((option) => option.value === action.value);
    if (index >= 0) select.selectedIndex = index;
  }

  announce(element);
  select.blur();
}

/**
 * Checkboxes and radios.
 *
 * `click()` first, deliberately. Frameworks listen for click on these far more
 * reliably than for a programmatic `checked` assignment, and a real click also
 * fires the events in the platform's own order. The native setter is the fallback
 * for the cases where a click is intercepted.
 */
function writeCheck(element: Element, action: CheckAction, technique: Technique): void {
  const input = element as HTMLInputElement;

  if (technique === "primary") {
    input.click();
    return;
  }

  setChecked(element, action.checked);
  announce(element, ["change"]);
}

/**
 * Is this already what was asked for?
 *
 * Checked before writing, because clicking a checkbox that is already ticked
 * unticks it — the one case where doing the work is worse than skipping it.
 */
export function alreadySatisfied(element: Element, action: CheckAction): boolean {
  return (element as HTMLInputElement).checked === action.checked;
}

export function write(
  element: Element,
  action: FillAction | SelectAction | CheckAction,
  technique: Technique,
): void {
  switch (action.type) {
    case "fill":
      writeText(element, action, technique);
      return;
    case "select":
      writeSelect(element, action, technique);
      return;
    case "check":
      writeCheck(element, action, technique);
  }
}
