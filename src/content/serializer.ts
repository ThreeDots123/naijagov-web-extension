import type {
  PageSnapshot,
  SensitiveFlag,
  SerializedButton,
  SerializedField,
  SerializedFrame,
  SerializedLink,
} from "@/shared/page";
import { hashPage } from "@/shared/page-hash";
import { cleanText, urlWithoutQuery } from "@/content/dom";
import { buttonText } from "@/content/classify";
import type { FieldCandidate } from "@/content/collect";
import { collectCandidates } from "@/content/collect";
import { inspectElement, summarise } from "@/content/detector";
import type { FieldRegistry } from "@/content/registry";
import {
  clearStaleStamps,
  currentGeneration,
  generationOf,
  materialise,
  register,
  startGeneration,
} from "@/content/registry";

// Re-exported so the rest of the content script has one import for "the
// serializer's output and the things that describe it".
export { FIELD_ID_ATTRIBUTE } from "@/content/registry";
export type { FieldRegistry } from "@/content/registry";
export { hashPage } from "@/shared/page-hash";

/**
 * DOM → structured page JSON.
 *
 * A pure function over a DOM node: no messaging, no storage, no fetch. The only
 * thing it writes to the page is the `data-copilot-id` attribute, and it writes
 * those last, after every read is done.
 *
 * Two rules it holds to:
 *
 *  - It stamps ids and owns the registry. That registry is the only way an action
 *    ever reaches an element, and an unknown id is rejected rather than resolved.
 *  - It serializes labels and structure. It does not read what the user has
 *    already typed. `SerializedField` has no slot for a value, on purpose.
 */

/** Past these, the tail is dropped and the snapshot says so. */
export const MAX_FIELDS = 300;
export const MAX_BUTTONS = 100;

/**
 * Links are capped far lower than buttons, and are deduplicated first.
 *
 * A portal's chrome — the masthead, the footer, a breadcrumb, a language switcher —
 * is mostly links, and sending two hundred of them would bury the one that says
 * "Renew Licence" in noise the model has to read past. Forty, in document order, is
 * generous for the navigation that actually sits above the fold.
 */
export const MAX_LINKS = 40;

export interface SerializeResult {
  snapshot: PageSnapshot;
  registry: FieldRegistry;
}

export function serializePage(root: Document | Element = document): SerializeResult {
  const candidates = collectCandidates(root);

  const fieldPicks = capFields(candidates.fields);
  const buttonPicks = candidates.buttons.slice(0, MAX_BUTTONS);
  const linkPicks = capLinks(candidates.links);
  const truncated =
    fieldPicks.length < candidates.fields.length ||
    buttonPicks.length < candidates.buttons.length ||
    linkPicks.length < candidates.links.length;

  // Everything above was a read. From here on ids are minted and stamped, which
  // is the one mutation the Copilot makes to a page it has not been asked to fill.
  //
  // The picks go in, in the order they are about to be registered, so the registry
  // can tell a page that changed from a page that was merely read again.
  startGeneration([
    ...fieldPicks.map((candidate) => candidate.element),
    ...buttonPicks,
    ...linkPicks,
    ...candidates.frames,
  ]);

  const flags: SensitiveFlag[] = [];
  const fields = fieldPicks.map((candidate) => toField(candidate, flags));
  const buttons = buttonPicks.map((element) => toButton(element, flags));
  const links = linkPicks.map((element) => toLink(element, flags));
  const frames = candidates.frames.map((element) => toFrame(element, flags));

  clearStaleStamps(root);

  const document_ = documentOf(root);
  const withoutHash = {
    url: urlWithoutQuery(document_?.location?.href ?? ""),
    title: document_?.title ?? "",
    generation: currentGenerationOf(fields, buttons, links, frames),
    headings: candidates.headings,
    fields,
    buttons,
    links,
    frames,
    sensitiveFlags: flags,
    // A flagged link never gates the page. See `summarise` — a "Make a payment"
    // item in a portal's navigation is on every page including the ones with no
    // payment on them.
    checkpoint: summarise(flags, new Set(links.map((link) => link.fieldId))),
    counts: {
      fields: candidates.fields.length,
      buttons: candidates.buttons.length,
      contentEditable: candidates.contentEditable,
    },
    truncated,
    ambiguous: candidates.unreadable > 0 || fields.some((field) => field.labelMethod === "none"),
  } satisfies Omit<PageSnapshot, "pageHash">;

  return {
    snapshot: { ...withoutHash, pageHash: hashPage(withoutHash) },
    registry: materialise(),
  };
}

/**
 * Keep required fields when the cap bites.
 *
 * A 400-field page is a portal rendering every step at once, and the half the user
 * has to fill matters more than the half they do not. Document order is restored
 * afterwards, because the order of the fields is part of the page hash and part of
 * how a person reads the form.
 */
function capFields(candidates: FieldCandidate[]): FieldCandidate[] {
  if (candidates.length <= MAX_FIELDS) return candidates;

  const ordered = candidates.map((candidate, index) => ({ candidate, index }));
  const kept = [
    ...ordered.filter((entry) => entry.candidate.required),
    ...ordered.filter((entry) => !entry.candidate.required),
  ].slice(0, MAX_FIELDS);

  return kept.sort((a, b) => a.index - b.index).map((entry) => entry.candidate);
}

function toField(candidate: FieldCandidate, flags: SensitiveFlag[]): SerializedField {
  const fieldId = register(candidate.element);
  const found = inspectElement(candidate.element, candidate.label.label);
  if (found) flags.push({ ...found, fieldId });

  return {
    fieldId,
    type: candidate.type,
    label: candidate.label.label,
    rawLabel: candidate.label.raw,
    labelMethod: candidate.label.method,
    required: candidate.required,
    disabled: candidate.disabled,
    readOnly: candidate.readOnly,
    ...(candidate.maxLength === undefined ? {} : { maxLength: candidate.maxLength }),
    ...(candidate.options === undefined ? {} : { options: candidate.options }),
    ...(candidate.optionsTruncated ? { optionsTruncated: true } : {}),
    ...(candidate.hint === undefined ? {} : { hint: candidate.hint }),
    sensitive: found !== undefined,
  };
}

/**
 * The links worth sending, in document order.
 *
 * Deduplicated before the cap, not after, because a portal's masthead and its
 * footer carry the same six items and two identical rows help nobody. A link with
 * no text is dropped outright: the text is the only part of a link the Copilot can
 * put in a sentence, and one without it cannot be named to anybody.
 */
function capLinks(elements: readonly Element[]): Element[] {
  const seen = new Set<string>();
  const kept: Element[] = [];

  for (const element of elements) {
    if (kept.length >= MAX_LINKS) break;

    const text = cleanText(buttonText(element));
    if (!text) continue;

    const key = `${text.toLowerCase()}\u001f${linkHref(element)}`;
    if (seen.has(key)) continue;

    seen.add(key);
    kept.push(element);
  }

  return kept;
}

/**
 * Where a link goes, when that is something we can say.
 *
 * Empty for anything that is not plain http(s): a bare `#`, a `javascript:`
 * handler, a `mailto:`. Those are still links a person clicks and they are still
 * serialized — their text is the useful part — but describing their destination
 * would mean inventing one.
 */
function linkHref(element: Element): string {
  const raw = element.getAttribute("href")?.trim() ?? "";
  if (!raw || raw.startsWith("#")) return "";

  try {
    const parsed = new URL(raw, element.ownerDocument?.baseURI);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function toLink(element: Element, flags: SensitiveFlag[]): SerializedLink {
  const fieldId = register(element);
  const found = inspectElement(element);
  if (found) flags.push({ ...found, fieldId });

  const href = linkHref(element);

  return {
    fieldId,
    text: buttonText(element),
    href,
    external: isCrossOrigin(href, element),
    sensitive: found !== undefined,
  };
}

function toButton(element: Element, flags: SensitiveFlag[]): SerializedButton {
  const fieldId = register(element);
  const found = inspectElement(element);
  if (found) flags.push({ ...found, fieldId });

  return { fieldId, text: buttonText(element), sensitive: found !== undefined };
}

/**
 * A frame, described by where it points and nothing else.
 *
 * A cross-origin frame cannot be read at all — that is the browser's rule, not a
 * choice — so the src is the only fact there is, and it is enough to recognise a
 * CAPTCHA or a payment provider.
 */
function toFrame(element: Element, flags: SensitiveFlag[]): SerializedFrame {
  const fieldId = register(element);
  const found = inspectElement(element);
  if (found) flags.push({ ...found, fieldId });

  const raw = element.getAttribute("src") ?? "";
  const base = element.ownerDocument?.baseURI;
  const src = raw ? urlWithoutQuery(raw, base) : "";

  return { fieldId, src, crossOrigin: isCrossOrigin(src, element), sensitive: found !== undefined };
}

function isCrossOrigin(src: string, element: Element): boolean {
  if (!src) return false;

  const here = element.ownerDocument?.location?.origin;
  try {
    return new URL(src).origin !== here;
  } catch {
    return false;
  }
}

/**
 * The generation every id in this snapshot carries.
 *
 * Read back off a minted id rather than asked for separately, so the number in
 * the snapshot cannot disagree with the ids in it.
 */
function currentGenerationOf(
  fields: SerializedField[],
  buttons: SerializedButton[],
  links: SerializedLink[],
  frames: SerializedFrame[],
): number {
  // Links are in the chain because a landing page has neither fields nor buttons,
  // and they are the only stamped thing on it.
  const first =
    fields[0]?.fieldId ?? buttons[0]?.fieldId ?? links[0]?.fieldId ?? frames[0]?.fieldId;
  if (first === undefined) return currentGeneration();

  return generationOf(first) ?? currentGeneration();
}

function documentOf(root: Document | Element): Document | undefined {
  return "location" in root ? (root as Document) : (root.ownerDocument ?? undefined);
}
