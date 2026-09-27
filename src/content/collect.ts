import type { FieldType, SerializedOption } from "@/shared/page";
import { cleanText, elementText, isVisible, walkElements } from "@/content/dom";
import { fieldTypeOf, isButtonLike, isContentEditable, owningForm } from "@/content/classify";
import type { ResolvedLabel } from "@/content/labels";
import { findHint, humanise, isRequired, resolveLabel } from "@/content/labels";

/**
 * The reading half of serialization.
 *
 * Every function here reads the page and none of them writes to it, which is what
 * lets the serializer finish all of its reading before it stamps a single id — one
 * layout pass for the whole form instead of one per field.
 */

/** A select records this many options; past it the list is cut and flagged. */
export const MAX_OPTIONS = 40;

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const MAX_HEADINGS = 20;

export interface FieldCandidate {
  /** The element an action would address. For a radio group, the first radio. */
  element: Element;
  type: FieldType;
  label: ResolvedLabel;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  maxLength?: number;
  options?: SerializedOption[];
  optionsTruncated?: boolean;
  hint?: string;
}

export interface Candidates {
  fields: FieldCandidate[];
  buttons: Element[];
  frames: Element[];
  headings: string[];
  contentEditable: number;
  unreadable: number;
}

export function collectCandidates(root: Document | Element = document): Candidates {
  const { elements, unreadable } = walkElements(root);

  const fields: FieldCandidate[] = [];
  const buttons: Element[] = [];
  const frames: Element[] = [];
  const headings: string[] = [];
  const radioGroups = new Map<string, Element[]>();
  let contentEditable = 0;

  for (const element of elements) {
    // Frames are judged by where they point, so a hidden one counts: a CAPTCHA
    // that is about to be revealed is still a CAPTCHA.
    if (element.tagName === "IFRAME") {
      frames.push(element);
      continue;
    }

    if (element.matches(HEADING_SELECTOR)) {
      if (headings.length < MAX_HEADINGS && isVisible(element)) {
        const text = elementText(element);
        if (text) headings.push(text);
      }
      continue;
    }

    if (isContentEditable(element)) {
      contentEditable += 1;
      continue;
    }

    if (!isVisible(element)) continue;

    if (isButtonLike(element)) {
      buttons.push(element);
      continue;
    }

    const type = fieldTypeOf(element);
    if (!type) continue;

    // A radio group is one question to a person and must be one row in the
    // preview, so the group is assembled and emitted once, below.
    if (type === "radio") {
      const key = radioGroupKey(element);
      const group = radioGroups.get(key);
      if (group) group.push(element);
      else radioGroups.set(key, [element]);
      continue;
    }

    fields.push(describeField(element, type));
  }

  for (const group of radioGroups.values()) {
    const candidate = describeRadioGroup(group);
    if (candidate) fields.push(candidate);
  }

  return { fields, buttons, frames, headings, contentEditable, unreadable };
}

function describeField(element: Element, type: FieldType): FieldCandidate {
  const label = resolveLabel(element);
  const options = type === "select" ? readSelectOptions(element) : undefined;

  return {
    element,
    type,
    label,
    required: isRequired(element, label.raw),
    disabled: isDisabled(element),
    readOnly: isReadOnly(element),
    maxLength: readMaxLength(element),
    options: options?.options,
    optionsTruncated: options?.truncated,
    hint: findHint(element),
  };
}

/**
 * One field for a whole radio group.
 *
 * The group's label comes from its container, not from any one radio: a radio's
 * own `<label>` is the name of an *option*, so resolving the question from it
 * would produce a field called "Retail" with five options.
 */
function describeRadioGroup(group: Element[]): FieldCandidate | undefined {
  const first = group[0];
  if (!first) return undefined;

  const label = resolveGroupLabel(first);

  return {
    element: first,
    type: "radio",
    label,
    required: group.some((radio) => isRequired(radio, label.raw)),
    disabled: group.every(isDisabled),
    readOnly: false,
    options: group.map((radio) => ({
      label: resolveLabel(radio).label || humanise(radio.getAttribute("value") ?? ""),
      value: radio.getAttribute("value") ?? "on",
    })),
    hint: findHint(first),
  };
}

function resolveGroupLabel(radio: Element): ResolvedLabel {
  const container = radio.closest("fieldset") ?? radio.parentElement;
  const fromContainer = container ? resolveLabel(container, { groupLike: true }) : undefined;
  if (fromContainer?.label) return fromContainer;

  const name = radio.getAttribute("name") ?? "";
  const humanised = humanise(name);
  return humanised
    ? { label: humanised, raw: name, method: "name" }
    : { label: "", raw: "", method: "none" };
}

/**
 * A select's options.
 *
 * `value` is read as an attribute, falling back to the option's text the way the
 * platform does. The validator checks a planned fill against exactly this list,
 * so the empty "Select one" placeholder is kept: it is a real option, and a plan
 * that chooses it is choosing nothing, which is a thing the user may want.
 */
function readSelectOptions(element: Element): { options: SerializedOption[]; truncated: boolean } {
  const all = element.querySelectorAll("option");
  const options: SerializedOption[] = [];

  for (const option of all) {
    if (options.length >= MAX_OPTIONS) break;
    const text = elementText(option);
    options.push({ label: text, value: option.getAttribute("value") ?? text });
  }

  return { options, truncated: all.length > options.length };
}

/**
 * Radios are grouped by name *within a form*.
 *
 * Two forms on one page can both have a `title` radio group, and merging them
 * would produce one field whose options came from two different questions.
 */
function radioGroupKey(element: Element): string {
  const form = owningForm(element);
  const formKey = form ? formIdentity(form) : "no-form";
  return `${formKey}\u001f${element.getAttribute("name") ?? ""}`;
}

const formIds = new WeakMap<Element, number>();
let nextFormId = 0;

function formIdentity(form: Element): string {
  const existing = formIds.get(form);
  if (existing !== undefined) return String(existing);

  nextFormId += 1;
  formIds.set(form, nextFormId);
  return String(nextFormId);
}

function isDisabled(element: Element): boolean {
  if (element.getAttribute("aria-disabled") === "true") return true;
  if ("disabled" in element) return Boolean((element as { disabled?: unknown }).disabled);
  return element.hasAttribute("disabled");
}

function isReadOnly(element: Element): boolean {
  if (element.getAttribute("aria-readonly") === "true") return true;
  return element.hasAttribute("readonly");
}

function readMaxLength(element: Element): number | undefined {
  const raw = cleanText(element.getAttribute("maxlength") ?? "");
  if (!raw) return undefined;

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
