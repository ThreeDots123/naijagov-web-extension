import { matchesSupportedHost } from "@/shared/hosts";
import type {
  DisconnectedMessage,
  FieldHighlightedMessage,
  FieldHighlightMessage,
  Message,
  PongMessage,
  Response,
} from "@/shared/messages";
import {
  assertNever,
  broadcast,
  messageError,
  notImplemented,
  sendToTab,
} from "@/shared/messages";
import type { HealthState } from "@/shared/state";
import { ACCOUNT_KEYS, HEALTH_KEY } from "@/shared/state";
import { getHealth, isHealthy } from "@/sw/api";
import { clearChat } from "@/sw/chat";
import {
  activeSupportedTab,
  beginReading,
  raiseCheckpoint,
  readActiveTab,
  receiveSnapshot,
} from "@/sw/page";
import { requestPlan } from "@/sw/plan";
import { approvePlan, cancelPlan } from "@/sw/plan-approval";
import { clearAllSessions, clearSession } from "@/sw/session";

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

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const message = raw as Message;

  handleMessage(message, sender).then(sendResponse, (error: unknown) => {
    sendResponse(messageError(error));
  });

  // Keep the channel open for the async handler above.
  return true;
});

/**
 * A supported page finished loading, so whatever we knew about it is stale. The
 * next read re-stamps ids, which is what stops an action from addressing an
 * element that no longer exists.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!matchesSupportedHost(tab.url)) return;
  void beginReading(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearSession(tabId);
  void clearChat(tabId);
});

async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<Response<Message> | void> {
  switch (message.type) {
    case "PING":
      return pingActiveTab();

    case "SERIALIZE_PAGE":
      return readActiveTab();

    case "PAGE_SNAPSHOT":
      return receiveSnapshot(message.snapshot, tabIdOf(sender, message.type));

    case "CHECKPOINT_DETECTED":
      return raiseCheckpoint(
        tabIdOf(sender, message.type),
        message.reason,
        message.fieldId,
      );

    case "HEALTH_CHECK":
      return { type: "HEALTH_RESULT", health: await checkHealth() };

    case "DISCONNECT":
      return disconnect();

    case "PLAN_REQUEST":
      return requestPlan((await activeSupportedTab()).id, message.message);

    case "PLAN_APPROVE":
      return approvePlan((await activeSupportedTab()).id, message.turnId, message.rows);

    case "PLAN_CANCEL":
      return cancelPlan((await activeSupportedTab()).id, message.turnId);

    case "FIELD_HIGHLIGHT":
      return highlightOnPage(message);

    // Declared, not built. The executor task replaces these two lines, not the
    // contract.
    case "EXECUTE_ACTIONS":
    case "ACTION_RESULTS":
      return notImplemented(message.type);

    // Answers and broadcasts. They travel to the panel; they never arrive here.
    case "PONG":
    case "STATE_CHANGED":
    case "HEALTH_RESULT":
    case "DISCONNECTED":
    case "PLAN_READY":
    case "PLAN_APPROVED":
    case "PLAN_CANCELLED":
    case "FIELD_HIGHLIGHTED":
    case "PAGE_HASH":
    // Sent *by* the worker to a content script, never to it.
    case "PAGE_HASH_CHECK":
      throw new Error(`${message.type} is not addressed to the service worker.`);

    default:
      return assertNever(message, "message");
  }
}

/**
 * Which tab a message came from.
 *
 * A snapshot or a checkpoint is only meaningful about the page that produced it,
 * and a message that arrives without a tab did not come from a content script.
 */
function tabIdOf(sender: chrome.runtime.MessageSender, type: string): number {
  const tabId = sender.tab?.id;
  if (tabId === undefined) throw new Error(`${type} arrived without a tab.`);
  return tabId;
}

/**
 * Pass a highlight request through to the page.
 *
 * The panel cannot reach a content script itself, so a hovered preview row goes the
 * long way round. A tab with nothing listening is the ordinary case rather than an
 * error — the user may have navigated — and it answers "nothing drawn" instead of
 * throwing, because a failed hover must never interrupt what the user was reading.
 */
async function highlightOnPage(
  message: FieldHighlightMessage,
): Promise<FieldHighlightedMessage> {
  try {
    const tab = await activeSupportedTab();

    return await sendToTab(tab.id, message);
  } catch {
    return { type: "FIELD_HIGHLIGHTED", drawn: false };
  }
}

/** panel → sw → content → back again. The proof that the pipe is connected. */
async function pingActiveTab(): Promise<PongMessage> {
  const tab = await activeSupportedTab();

  try {
    return await sendToTab(tab.id, { type: "PING" });
  } catch {
    throw new Error("Reload the page so the Copilot can attach to it.");
  }
}

/**
 * Forget the account.
 *
 * Three things go, in an order that matters. The token first, because it is the
 * credential and the only thing that grants access to anything else. Then the
 * profile cache. Then every tab's session state, because a pending action can
 * carry a value derived from the profile and `chrome.storage.session` outlives a
 * panel being closed.
 *
 * `storage.local` is not encrypted, so "the next person opens the panel" is the
 * case this exists for. Anything that survives here is a leak.
 */
async function disconnect(): Promise<DisconnectedMessage> {
  await chrome.storage.local.remove([...ACCOUNT_KEYS]);
  await clearAllSessions();

  // The panel derives its state per tab, and every tab's state just went away.
  await broadcast({ type: "STATE_CHANGED", state: "IDLE" });

  return { type: "DISCONNECTED" };
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
    health = { reachable: isHealthy(response), checkedAt: Date.now() };
  } catch {
    health = { reachable: false, checkedAt: Date.now() };
  }

  await chrome.storage.session.set({ [HEALTH_KEY]: health });
  return health;
}
