import { matchesSupportedHost } from "@/shared/hosts";
import type { CheckpointDetectedMessage, PageSnapshotMessage } from "@/shared/messages";
import { broadcast, sendToTab } from "@/shared/messages";
import type { PageSnapshot } from "@/shared/page";
import { hasToken } from "@/sw/api";
import { getSession, setSession, setState } from "@/sw/session";

/**
 * What the worker does with a page it has been told about.
 *
 * The content script reads the page; this decides what that means for the state
 * machine. Kept out of the router so that `service-worker.ts` stays a list of
 * message types and where each one goes.
 */

/** The active tab, if it is one we are allowed to touch. */
export async function activeSupportedTab(): Promise<chrome.tabs.Tab & { id: number }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab?.id) throw new Error("No active tab to read.");
  if (!matchesSupportedHost(tab.url)) throw new Error("The Copilot doesn't work on this page.");

  return tab as chrome.tabs.Tab & { id: number };
}

/**
 * A supported page finished loading.
 *
 * Whatever we knew about that tab is stale, so the next read re-stamps ids. An
 * unconnected install goes to `IDLE` instead of `READING`: it has nothing to read
 * the page *for*, and a tab left in `READING` that no snapshot will ever complete
 * shows the user "Reading the page…" forever.
 */
export async function beginReading(tabId: number): Promise<void> {
  await setState(tabId, (await hasToken()) ? "READING" : "IDLE");
}

/**
 * Ask the active tab to read itself.
 *
 * The snapshot comes back as the reply, so it is recorded here rather than being
 * pushed a second time by the content script's observer.
 */
export async function readActiveTab(): Promise<PageSnapshotMessage> {
  const tab = await activeSupportedTab();
  await setState(tab.id, "READING");

  let reply: PageSnapshotMessage;
  try {
    reply = await sendToTab(tab.id, { type: "SERIALIZE_PAGE" });
  } catch {
    throw new Error("Reload the page so the Copilot can attach to it.");
  }

  await receiveSnapshot(reply.snapshot, tab.id);
  return reply;
}

/**
 * Record a snapshot and move the tab to where it now belongs.
 *
 * The page hash is kept because it is what makes a stale plan recognisable: a
 * plan built against a hash the page no longer has is re-planned, not applied.
 *
 * `POST /context` belongs here and is deliberately absent — naijagov-api has no
 * such endpoint yet, and inventing its shape from this side would create exactly
 * the two-repo disagreement the action schema exists to prevent.
 */
export async function receiveSnapshot(snapshot: PageSnapshot, tabId: number): Promise<void> {
  // An unconnected install does nothing with a page. The content script still
  // reads and stamps locally — that is how the panel can offer to help the moment
  // a token arrives — but `IDLE` means "no valid token", and a page mutating on a
  // tab nobody has connected is not a reason to leave it.
  if (!(await hasToken())) return;

  const session = await getSession(tabId);
  await setSession(tabId, { pageHash: snapshot.pageHash });

  if (snapshot.checkpoint.blocking) {
    const blocker = snapshot.sensitiveFlags.find(
      (entry) => entry.kind === "captcha" || entry.kind === "payment",
    );
    await raiseCheckpoint(tabId, blocker?.reason ?? "This page needs you to take over.", blocker?.fieldId);
    return;
  }

  // Nothing moves a tab out of CHECKPOINT except the user choosing to continue.
  // A re-read of the same page is not that choice.
  if (session.state === "CHECKPOINT") return;

  await setState(tabId, "READY");
}

/**
 * Stop, and cancel everything that was waiting to run.
 *
 * Pending actions go first and unconditionally: they were planned against a page
 * that has since turned out to contain something the Copilot must not touch, and
 * an action that survives a checkpoint is the one bug this product cannot have.
 */
export async function raiseCheckpoint(
  tabId: number,
  reason: string,
  fieldId?: string,
): Promise<void> {
  await setSession(tabId, { checkpointReason: reason, pendingActions: [] });
  await setState(tabId, "CHECKPOINT");

  const message: CheckpointDetectedMessage = fieldId
    ? { type: "CHECKPOINT_DETECTED", reason, fieldId }
    : { type: "CHECKPOINT_DETECTED", reason };

  await broadcast(message);
}
