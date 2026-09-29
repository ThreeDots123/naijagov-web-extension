import type { FieldId } from "@/shared/actions";
import type { CheckpointSummary, SensitiveFlag, SensitiveKind } from "@/shared/page";
import { isBlockingKind } from "@/shared/page";
import { walkElements } from "@/content/dom";
import { fieldTypeOf, inputType, isButtonLike, owningForm } from "@/content/classify";
import { FIELD_ID_ATTRIBUTE } from "@/content/registry";
import {
  CAPTCHA_HOSTS,
  PAYMENT_HOSTS,
  SENSITIVE_BUTTON_PATTERNS,
  SENSITIVE_FIELD_PATTERNS,
  SENSITIVE_REASONS,
  haystack,
  matchAutocomplete,
  matchHost,
  matchText,
} from "@/content/sensitive";

/**
 * Deterministic sensitive-element detection.
 *
 * Pure functions over a DOM node. No messaging, no storage, no fetch — which is
 * what makes every rule in `sensitive.ts` testable, including the negative cases.
 *
 * This runs in code, before the model ever sees the page, and again immediately
 * before every single action. The model's opinion can *add* to what this finds. It
 * can never overrule it, and nothing here takes a hint from page text about what
 * should be considered safe.
 *
 * Visibility is not a consideration. A hidden password field is a password field,
 * and a page that reveals one between the plan and the act must not get a
 * different answer than a page that showed it all along.
 */

export function inspectElement(element: Element, label?: string): SensitiveFlag | undefined {
  const kind = kindOf(element, label);
  if (!kind) return undefined;

  const fieldId = element.getAttribute(FIELD_ID_ATTRIBUTE);
  return flag(kind, fieldId ?? undefined);
}

/** Walk everything under `root` and return one flag per element that earns one. */
export function detectSensitive(root: Document | Element = document): SensitiveFlag[] {
  const { elements } = walkElements(root);

  const flags: SensitiveFlag[] = [];
  for (const element of elements) {
    const found = inspectElement(element);
    if (found) flags.push(found);
  }

  return flags;
}

/**
 * The first thing on the page that stops the whole page, if there is one.
 *
 * Short-circuits, because this runs between every single action in a batch and a
 * batch has a ten-second budget. It answers a narrower question than
 * `detectSensitive`: not "what would the Copilot refuse to touch", which is most
 * of a portal, but "has this page become one the Copilot must hand back" — a
 * CAPTCHA or a payment, and nothing else. A password field appearing mid-run stops
 * that *action*, through the validator, not the run.
 */
export function detectBlocking(root: Document | Element = document): SensitiveFlag | undefined {
  const { elements } = walkElements(root);

  for (const element of elements) {
    const kind = kindOf(element);
    if (kind && isBlockingKind(kind)) {
      return flag(kind, element.getAttribute(FIELD_ID_ATTRIBUTE) ?? undefined);
    }
  }

  return undefined;
}

export function flag(kind: SensitiveKind, fieldId?: FieldId): SensitiveFlag {
  return fieldId ? { fieldId, kind, reason: SENSITIVE_REASONS[kind] } : { kind, reason: SENSITIVE_REASONS[kind] };
}

/**
 * What the flags add up to for the page as a whole.
 *
 * `present` means "there are things here the Copilot will not touch", which the
 * panel says out loud. `blocking` means the page is gated by a third party — a
 * CAPTCHA or a payment — and is the only thing that raises the `CHECKPOINT` state.
 *
 * The distinction matters because a password field and a Submit button are on
 * nearly every portal page. Treating either as a page-level stop would leave the
 * Copilot permanently paused and useless, while treating a payment page as
 * ordinary work is exactly the mistake this product exists not to make.
 */
export function summarise(flags: readonly SensitiveFlag[]): CheckpointSummary {
  const kinds = [...new Set(flags.map((entry) => entry.kind))];

  return {
    present: flags.length > 0,
    blocking: kinds.some(isBlockingKind),
    kinds,
  };
}

function kindOf(element: Element, label?: string): SensitiveKind | undefined {
  if (element.tagName === "IFRAME") return frameKind(element);
  if (isButtonLike(element)) return buttonKind(element);
  if (fieldTypeOf(element)) return fieldKind(element, label);
  return undefined;
}

/**
 * A frame is judged entirely by where it points.
 *
 * A cross-origin frame cannot be read at all, which is the whole reason the lists
 * in `sensitive.ts` are matched on the host: it is the only fact available.
 */
function frameKind(element: Element): SensitiveKind | undefined {
  const src = element.getAttribute("src");
  if (!src) return undefined;

  const absolute = absoluteUrl(src, element);
  if (!absolute) return undefined;

  if (matchHost(absolute, CAPTCHA_HOSTS)) return "captcha";
  if (matchHost(absolute, PAYMENT_HOSTS)) return "payment";
  return undefined;
}

function buttonKind(element: Element): SensitiveKind | undefined {
  const text = haystack(
    element.getAttribute("value"),
    element.getAttribute("aria-label"),
    element.textContent,
  );

  const byText = matchText(text, SENSITIVE_BUTTON_PATTERNS);
  if (byText) return byText;

  return submitsToPaymentHost(element) ? "payment" : undefined;
}

function fieldKind(element: Element, label?: string): SensitiveKind | undefined {
  if (element.tagName === "INPUT" && inputType(element) === "password") return "password";

  const byAutocomplete = matchAutocomplete(element.getAttribute("autocomplete"));
  if (byAutocomplete) return byAutocomplete;

  const byName = matchText(
    haystack(
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      label,
    ),
    SENSITIVE_FIELD_PATTERNS,
  );
  if (byName) return byName;

  if (element.tagName === "INPUT" && inputType(element) === "file") return "upload";

  return submitsToPaymentHost(element) ? "payment" : undefined;
}

/** Is this element part of a form that posts to a payment provider? */
function submitsToPaymentHost(element: Element): boolean {
  const form = owningForm(element);
  if (!form) return false;

  const action = form.getAttribute("action");
  if (!action) return false;

  const absolute = absoluteUrl(action, element);
  return absolute !== undefined && matchHost(absolute, PAYMENT_HOSTS) !== undefined;
}

function absoluteUrl(value: string, element: Element): string | undefined {
  const base = element.ownerDocument?.baseURI;

  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}
