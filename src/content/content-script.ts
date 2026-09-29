import type { Message, MessageType, Response } from "@/shared/messages";
import { isMessage, messageError } from "@/shared/messages";
import { ROW_HIGHLIGHT } from "@/shared/overlay";
import { clearHighlights, highlightField, mountOverlay, revealField } from "@/content/overlay";
import { readPage, startObserving } from "@/content/observer";
import { runActions } from "@/content/runner";

/**
 * The content script: the only code in this extension that touches a page.
 *
 * It reads structure, it draws the overlay, and it runs actions the validator
 * has cleared. It never calls the backend — anything that needs the network goes
 * through the service worker.
 */

declare global {
  interface Window {
    __naijagov?: true;
  }
}

/**
 * Injection guard.
 *
 * Content scripts run in an isolated world, so this flag is ours and the page
 * cannot see or set it. It survives a soft re-injection into the same document,
 * which is what stops a second listener answering every PING twice.
 */
if (!window.__naijagov) {
  window.__naijagov = true;
  init();
}

/**
 * What this script answers to.
 *
 * Everything else — broadcasts to the panel, messages the worker sends itself —
 * is ignored without a reply, so a `STATE_CHANGED` going out to every context
 * passes over the page instead of landing here as an error.
 */
const HANDLED = [
  "PING",
  "SERIALIZE_PAGE",
  "EXECUTE_ACTIONS",
  "PAGE_HASH_CHECK",
  "FIELD_HIGHLIGHT",
] as const satisfies readonly MessageType[];

type HandledMessage = Extract<Message, { type: (typeof HANDLED)[number] }>;

function isForUs(value: unknown): value is HandledMessage {
  return isMessage(value) && (HANDLED as readonly string[]).includes(value.type);
}

function init(): void {
  mountOverlay();
  startObserving();

  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    if (!isForUs(raw)) return false;

    handleMessage(raw).then(sendResponse, (error: unknown) => {
      sendResponse(messageError(error));
    });

    // Keep the channel open for the async handler above.
    return true;
  });
}

async function handleMessage(message: HandledMessage): Promise<Response<HandledMessage>> {
  switch (message.type) {
    case "PING":
      return {
        type: "PONG",
        url: location.href,
        // A count, not contents. Enough to prove the script is live on the page
        // the panel thinks it is on.
        elementCount: document.getElementsByTagName("*").length,
      };

    case "SERIALIZE_PAGE":
      // The worker receives the snapshot as the answer to its own question, so
      // the observer must not also push a copy of it. `readPage` records the
      // hash it produced, which is what keeps the next mutation quiet.
      return { type: "PAGE_SNAPSHOT", snapshot: readPage().snapshot };

    case "PAGE_HASH_CHECK": {
      // A full read, because the hash is a function of the whole structure and there
      // is no cheaper honest way to compute it. `readPage` also refreshes the registry,
      // which is what an approval about to address these ids needs.
      const { snapshot } = readPage();

      return {
        type: "PAGE_HASH",
        pageHash: snapshot.pageHash,
        generation: snapshot.generation,
      };
    }

    case "FIELD_HIGHLIGHT": {
      // No field means "stop pointing". Clearing everything rather than one box is
      // deliberate: the panel only ever points at one row at a time, and a clear that
      // had to name the right box could leave one behind.
      if (!message.fieldId) {
        clearHighlights();

        return { type: "FIELD_HIGHLIGHTED", drawn: false };
      }

      // `reveal` is "Show me" rather than a hover: the user asked for the page to
      // move, so it moves. A hover never scrolls anything.
      const state = message.state ?? ROW_HIGHLIGHT;
      const drawn = message.reveal
        ? revealField(message.fieldId, state)
        : highlightField(message.fieldId, state);

      return { type: "FIELD_HIGHLIGHTED", drawn };
    }

    // The only path in this extension that changes a government form. Every
    // action in it is re-checked against the live page immediately before it runs
    // — the backend's guard and the user's approval both worked from a picture
    // that is now a second old.
    case "EXECUTE_ACTIONS":
      return { type: "ACTION_RESULTS", report: await runActions(message.actions) };
  }
}
