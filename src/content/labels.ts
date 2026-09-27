import type { LabelMethod } from "@/shared/page";
import { cleanText, elementText, textFromIdList } from "@/content/dom";

/**
 * Label resolution, in one explicit order.
 *
 * The backend matches a workflow step on the labels this produces, so when a
 * match fails the first question is always "what label did we send, and how did
 * we get it?". Every result carries the rule that produced it, which is what makes
 * that answerable instead of an afternoon in the debugger.
 */

/** How much instruction text is worth carrying. Beyond this it is prose, not help. */
const HINT_MAX = 300;

/** How far up the tree rule 6 will look for preceding text. */
const NEARBY_MAX_HOPS = 3;

const FORM_CONTROL_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON", "OPTION", "LABEL"]);

export interface ResolvedLabel {
  /** Cleaned for reading: whitespace collapsed, a required marker stripped. */
  label: string;
  /** Whitespace collapsed, nothing stripped. The backend normalises its own way. */
  raw: string;
  method: LabelMethod;
}

export interface LabelOptions {
  /**
   * True for radio and checkbox groups, which take their question from the
   * enclosing `<legend>`. An ordinary text input inside a fieldset does not: its
   * label is its own, and the legend is the section heading above it.
   */
  groupLike?: boolean;
}

export function resolveLabel(element: Element, options: LabelOptions = {}): ResolvedLabel {
  for (const rule of RULES) {
    if (rule.method === "legend" && !options.groupLike) continue;

    const raw = cleanText(rule.read(element));
    if (raw) return { label: stripRequiredMarker(raw), raw, method: rule.method };
  }

  return { label: "", raw: "", method: "none" };
}

/** The ordered list. First non-empty result wins. */
const RULES: readonly { method: LabelMethod; read: (element: Element) => string }[] = [
  {
    method: "aria-labelledby",
    read: (element) => textFromIdList(element, element.getAttribute("aria-labelledby")),
  },
  { method: "aria-label", read: (element) => element.getAttribute("aria-label") ?? "" },
  { method: "label-for", read: readLabelFor },
  { method: "label-ancestor", read: readAncestorLabel },
  { method: "legend", read: readLegend },
  { method: "nearby-text", read: readNearbyText },
  { method: "placeholder", read: (element) => element.getAttribute("placeholder") ?? "" },
  { method: "title", read: (element) => element.getAttribute("title") ?? "" },
  { method: "name", read: (element) => humanise(element.getAttribute("name") ?? "") },
];

/**
 * Strip a trailing required marker.
 *
 * `Email address *` and `Email address (required)` are the same question. Whether
 * a portal marks it in the label is a styling decision, and it must not change
 * what a step is matched on.
 */
export function stripRequiredMarker(text: string): string {
  let value = text;
  let previous: string;

  do {
    previous = value;
    value = value
      .replace(/\s*\(\s*required\s*\)$/i, "")
      .replace(/\s*\*+$/, "")
      .trim();
  } while (value !== previous);

  return value;
}

/** `business_name` → `Business name`. The last resort, and it looks like one. */
export function humanise(name: string): string {
  const spaced = name
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\[\d*\]/g, "");

  const text = cleanText(spaced).toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/**
 * Is this field required?
 *
 * Three sources, because portals use all three: the attribute, the ARIA
 * attribute, and an asterisk in the label with nothing marking it in the markup.
 * It matters downstream — a required field with no data is what the guard reports
 * as `missing`.
 */
export function isRequired(element: Element, rawLabel: string): boolean {
  if (element.hasAttribute("required")) return true;
  if (element.getAttribute("aria-required") === "true") return true;
  return /\*\s*$|\(\s*required\s*\)\s*$/i.test(rawLabel);
}

/**
 * Instruction text sitting next to the field.
 *
 * `aria-describedby` first, because a portal that bothers to set it is telling us
 * exactly which text is the help; otherwise the following text in the same
 * container, which is where a hint is in practice.
 */
export function findHint(element: Element): string | undefined {
  const described = textFromIdList(element, element.getAttribute("aria-describedby"));
  if (described) return truncate(described);

  const container = element.parentElement;
  if (!container) return undefined;

  for (const sibling of container.children) {
    if (sibling === element || FORM_CONTROL_TAGS.has(sibling.tagName)) continue;
    if (sibling.querySelector("input, select, textarea, button")) continue;

    const text = elementText(sibling);
    if (text) return truncate(text);
  }

  return undefined;
}

function truncate(text: string): string {
  return text.length > HINT_MAX ? text.slice(0, HINT_MAX) : text;
}

function readLabelFor(element: Element): string {
  const id = element.getAttribute("id");
  if (!id) return "";

  const scope = element.getRootNode();
  if (!(scope instanceof Document) && !(scope instanceof ShadowRoot)) return "";

  for (const label of scope.querySelectorAll("label[for]")) {
    if (label.getAttribute("for") === id) return labelTextWithoutControls(label);
  }

  return "";
}

function readAncestorLabel(element: Element): string {
  const label = element.closest("label");
  return label ? labelTextWithoutControls(label) : "";
}

function readLegend(element: Element): string {
  const fieldset = element.closest("fieldset");
  if (!fieldset) return "";

  for (const child of fieldset.children) {
    if (child.tagName === "LEGEND") return elementText(child);
  }

  return "";
}

/**
 * Rule 6 — the nearest preceding text, in the same container.
 *
 * Walks backwards through siblings, then up a level and backwards again, a few
 * levels at most. It stops the moment it reaches another form control, because
 * the text before *that* belongs to the previous question and attaching it here
 * would be worse than having no label at all.
 */
function readNearbyText(element: Element): string {
  let node: Element | null = element;

  for (let hop = 0; hop <= NEARBY_MAX_HOPS && node; hop += 1) {
    for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (sibling.nodeType === Node.TEXT_NODE) {
        const text = cleanText(sibling.textContent ?? "");
        if (text) return text;
        continue;
      }

      if (sibling.nodeType !== Node.ELEMENT_NODE) continue;

      const candidate = sibling as Element;
      if (FORM_CONTROL_TAGS.has(candidate.tagName)) return "";
      if (candidate.querySelector("input, select, textarea")) return "";

      const text = elementText(candidate);
      if (text) return text;
    }

    node = node.parentElement;
    if (node && (node.tagName === "FORM" || node.tagName === "BODY")) break;
  }

  return "";
}

/**
 * A label's text, without the text of any control inside it.
 *
 * `<label>Nature <select><option>Retail</option></select></label>` must read
 * "Nature", not "Nature Retail Agriculture Services".
 */
function labelTextWithoutControls(label: Element): string {
  const parts: string[] = [];

  for (const node of label.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const child = node as Element;
    if (FORM_CONTROL_TAGS.has(child.tagName)) continue;
    parts.push(labelTextWithoutControls(child));
  }

  return cleanText(parts.join(" "));
}
