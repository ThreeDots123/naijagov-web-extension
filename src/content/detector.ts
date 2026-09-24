import type { SensitiveFlag } from "@/shared/page";

/**
 * Deterministic sensitive-element detection.
 *
 * Not implemented yet. The signature is the contract: pure functions over a DOM
 * node, returning flags.
 *
 * This runs in code, before the model ever sees the page, and again immediately
 * before every single action. The model's opinion can *add* to what this finds.
 * It can never overrule it, and this file must never take a hint from page text
 * about what it should consider safe.
 *
 * What it looks for when it is built:
 *
 *  - `input[type="password"]`
 *  - `autocomplete="one-time-code"`
 *  - CAPTCHA iframes
 *  - payment iframes and domains — Remita, Paystack, Interswitch, Flutterwave
 *  - buttons reading Pay / Submit / Confirm / Authorize / Verify
 */

export function detectSensitive(root: Document | Element = document): SensitiveFlag[] {
  throw new Error("detectSensitive is not implemented yet.");
}

/**
 * The single-element check, run again immediately before an action touches
 * anything. A page can change between the plan and the act.
 */
export function inspectElement(element: Element): SensitiveFlag | undefined {
  throw new Error("inspectElement is not implemented yet.");
}
