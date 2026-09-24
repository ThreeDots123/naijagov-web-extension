import type { Message, MessageType, Response } from "@/shared/messages";
import { isMessage, messageError, notImplemented } from "@/shared/messages";
import { mountOverlay } from "@/content/overlay";

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
const HANDLED = ["PING", "SERIALIZE_PAGE", "EXECUTE_ACTIONS"] as const satisfies readonly MessageType[];

type HandledMessage = Extract<Message, { type: (typeof HANDLED)[number] }>;

function isForUs(value: unknown): value is HandledMessage {
  return isMessage(value) && (HANDLED as readonly string[]).includes(value.type);
}

function init(): void {
  mountOverlay();

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

    // Declared, not built. The serializer and executor tasks fill these in
    // against the shape that already exists.
    case "SERIALIZE_PAGE":
    case "EXECUTE_ACTIONS":
      return notImplemented(message.type);
  }
}
