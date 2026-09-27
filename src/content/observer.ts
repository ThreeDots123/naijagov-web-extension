import { sendToRuntime } from "@/shared/messages";
import type { SerializeResult } from "@/content/serializer";
import { serializePage } from "@/content/serializer";
import { resetRegistry } from "@/content/registry";
import { clearHighlights } from "@/content/overlay";

/**
 * Watching the page, and deciding when the backend needs to hear about it.
 *
 * Portals mutate constantly — a validation message appears, a spinner spins, a
 * framework re-renders a section that did not change. Re-serializing on every one
 * of those is cheap; telling the backend about every one of them is not, and it
 * would mean a new `/context` call for every keystroke.
 *
 * So the rule is: re-serialize on mutation, report only when the page hash moves.
 * Typing into a field changes no label, no type, no option list — the hash is
 * unchanged and nothing is sent.
 */

/** Long enough that a framework's render settles, short enough to feel immediate. */
const DEBOUNCE_MS = 300;

/**
 * The attributes that can change what the page *is*.
 *
 * Narrow on purpose. `data-copilot-id` is deliberately absent: stamping ids is a
 * mutation, and an observer that watched it would wake itself up forever.
 */
const OBSERVED_ATTRIBUTES = ["disabled", "required", "hidden", "aria-hidden", "style", "class"];

let observer: MutationObserver | undefined;
let timer: number | undefined;
let lastHash: string | undefined;
let lastBlocking = false;

/**
 * Serialize now and remember what was found.
 *
 * Used to answer an explicit `SERIALIZE_PAGE`, where the worker receives the
 * snapshot as the reply and must not also be pushed a copy of it.
 */
export function readPage(): SerializeResult {
  const result = serializePage();
  lastHash = result.snapshot.pageHash;
  lastBlocking = result.snapshot.checkpoint.blocking;
  return result;
}

export function startObserving(): void {
  if (observer) return;

  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: OBSERVED_ATTRIBUTES,
  });

  // Same-document navigation does not re-inject the content script, so the
  // observer would be the only thing that noticed — and on a page that swaps its
  // whole body it may notice a half-rendered form. These two are the explicit
  // signal that the page became a different page.
  window.addEventListener("popstate", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("pagehide", teardown);
}

/**
 * Give up the page.
 *
 * Every listener off, the observer disconnected, the registry dropped and the
 * overlay cleared. A registry that outlived its document would hand the executor
 * ids for elements that no longer exist.
 */
export function stopObserving(): void {
  teardown();
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(reportIfChanged, DEBOUNCE_MS);
}

function reportIfChanged(): void {
  timer = undefined;

  const { snapshot } = serializePage();

  // A checkpoint is not gated on the hash. A payment frame that appears in a
  // section of a page that is otherwise identical is exactly the case where the
  // hash does not move and the user must still be stopped.
  if (snapshot.checkpoint.blocking && !lastBlocking) {
    const reason = snapshot.sensitiveFlags.find((entry) => entry.kind === "captcha")
      ?? snapshot.sensitiveFlags.find((entry) => entry.kind === "payment");

    void send({
      type: "CHECKPOINT_DETECTED",
      reason: reason?.reason ?? "This page needs you to take over.",
      ...(reason?.fieldId === undefined ? {} : { fieldId: reason.fieldId }),
    });
  }

  lastBlocking = snapshot.checkpoint.blocking;

  if (snapshot.pageHash === lastHash) return;

  lastHash = snapshot.pageHash;
  void send({ type: "PAGE_SNAPSHOT", snapshot });
}

/**
 * Talk to the worker, and shrug when nobody is listening.
 *
 * "Receiving end does not exist" is the normal case, not an error: the worker may
 * be asleep, and the extension may have been reloaded out from under this page.
 */
async function send(message: Parameters<typeof sendToRuntime>[0]): Promise<void> {
  try {
    await sendToRuntime(message);
  } catch {
    // Nothing is listening. The next read will try again.
  }
}

function teardown(): void {
  observer?.disconnect();
  observer = undefined;

  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;

  window.removeEventListener("popstate", schedule);
  window.removeEventListener("pageshow", schedule);
  window.removeEventListener("pagehide", teardown);

  clearHighlights();
  resetRegistry();
  lastHash = undefined;
  lastBlocking = false;
}
