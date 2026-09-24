import { matchesSupportedHost } from "@/shared/hosts";
import type { Message, PongMessage, Response } from "@/shared/messages";
import { assertNever, messageError, notImplemented, sendToTab } from "@/shared/messages";
import type { HealthState } from "@/shared/state";
import { HEALTH_KEY } from "@/shared/state";
import { getHealth } from "@/sw/api";
import { clearSession, setState } from "@/sw/session";

/**
 * The service worker: message router, tab bookkeeper, and the only context that
 * talks to the network.
 *
 * Everything here has to survive the worker being stopped and restarted between
 * any two events. Listeners register at the top level, state goes through
 * `session.ts`, and nothing is remembered in a variable.
 */

chrome.runtime.onInstalled.addListener(() => {
  // The toolbar icon opens the side panel.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Older Chrome without the API. The panel still opens from the menu.
  });
});

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as Message;

  handleMessage(message).then(sendResponse, (error: unknown) => {
    sendResponse(messageError(error));
  });

  // Keep the channel open for the async handler above.
  return true;
});

/**
 * A supported page finished loading, so whatever we knew about it is stale.
 * Back to READING — the next read re-stamps ids, which is what stops an action
 * from addressing an element that no longer exists.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!matchesSupportedHost(tab.url)) return;
  void setState(tabId, "READING");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearSession(tabId);
});

async function handleMessage(message: Message): Promise<Response<Message> | void> {
  switch (message.type) {
    case "PING":
      return pingActiveTab();

    case "HEALTH_CHECK":
      return { type: "HEALTH_RESULT", health: await checkHealth() };

    // Declared, not built. The task that implements each of these replaces the
    // line, not the contract.
    case "SERIALIZE_PAGE":
    case "EXECUTE_ACTIONS":
    case "PAGE_SNAPSHOT":
    case "ACTION_RESULTS":
    case "CHECKPOINT_DETECTED":
      return notImplemented(message.type);

    // Answers and broadcasts. They travel to the panel; they never arrive here.
    case "PONG":
    case "STATE_CHANGED":
    case "HEALTH_RESULT":
      throw new Error(`${message.type} is not addressed to the service worker.`);

    default:
      return assertNever(message, "message");
  }
}

/** panel → sw → content → back again. The proof that the pipe is connected. */
async function pingActiveTab(): Promise<PongMessage> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab to read.");
  }

  if (!matchesSupportedHost(tab.url)) {
    throw new Error("The Copilot doesn't work on this page.");
  }

  try {
    return await sendToTab(tab.id, { type: "PING" });
  } catch {
    throw new Error("Reload the page so the Copilot can attach to it.");
  }
}

/**
 * Ask the backend whether it is there, and remember the answer.
 *
 * Failure is an expected outcome, not an exception — during setup the backend
 * genuinely is not running.
 */
async function checkHealth(): Promise<HealthState> {
  let health: HealthState;

  try {
    const response = await getHealth();
    health = { reachable: response.ok, checkedAt: Date.now(), version: response.version };
  } catch {
    health = { reachable: false, checkedAt: Date.now() };
  }

  await chrome.storage.session.set({ [HEALTH_KEY]: health });
  return health;
}
