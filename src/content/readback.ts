import type { CheckAction, FillAction, SelectAction } from "@/shared/actions";

/**
 * Did it take?
 *
 * A fill is not done until it reads back. Frameworks silently reject programmatic
 * writes, portals clear fields on their own validation pass, and a green tick on a
 * field that is actually empty is the worst possible lie to tell someone filling a
 * government form — they will submit it believing us.
 *
 * **This file reads what is in the page's fields, and nothing it reads ever leaves
 * it.** The comparison happens here and only a verdict comes out: three words, no
 * value. That is the one place in the extension where a field's contents are read
 * at all, and it is bounded on purpose.
 */

export type Readback =
  /** Exactly what was written. */
  | "ok"
  /** The page rewrote it — stripped spaces, reformatted a date. Accepted, and said so. */
  | "changed"
  /** Not what was written, and not a reformatting of it. */
  | "mismatch";

/**
 * Wait for the page to catch up.
 *
 * A frame, so anything the write triggered has had a chance to render, then a
 * short delay for the frameworks that schedule their update a tick later. Both are
 * needed: the frame alone misses a microtask-deferred re-render, and the delay
 * alone reads a value the browser has not painted.
 */
const SETTLE_MS = 30;

export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, SETTLE_MS);
    });
  });
}

export function readBack(
  element: Element,
  action: FillAction | SelectAction | CheckAction,
): Readback {
  switch (action.type) {
    case "check":
      return (element as HTMLInputElement).checked === action.checked ? "ok" : "mismatch";

    case "select":
      // A select holds one of its own option values or it does not. There is no
      // reformatting a page could apply that would leave it meaningfully correct.
      return (element as HTMLSelectElement).value === action.value ? "ok" : "mismatch";

    case "fill":
      return compareText((element as HTMLInputElement).value, action.value);
  }
}

/**
 * What the field holds against what we asked for.
 *
 * The middle case is the one worth the code. Portals reformat constantly — a phone
 * number loses its spaces, a date turns into `01/02/2026`, a name is upper-cased —
 * and reporting that as a failure would send the user to check eight fields that
 * are all correct. It is reported as `changed` instead, which the panel says out
 * loud, so the user knows the page had an opinion.
 *
 * Truncation is deliberately *not* in that bucket. A page with a `maxlength` that
 * silently cut the value has given the user something they did not ask for, and
 * calling that "accepted" is how a half-written account number gets submitted.
 */
function compareText(actual: string, expected: string): Readback {
  const left = actual.trim();
  const right = expected.trim();

  if (left === right) return "ok";
  if (left.length === 0) return "mismatch";

  return normalise(left) === normalise(right) ? "changed" : "mismatch";
}

/** Case, spacing and separators removed — everything a reformatting is allowed to touch. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
