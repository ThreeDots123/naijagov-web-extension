import { useEffect, useState } from "react";
import type { Turn } from "@/shared/chat";
import { chatKey, isTranscript } from "@/shared/chat";
import type { ApprovedRow } from "@/shared/messages";
import { sendToRuntime } from "@/shared/messages";
import type { FieldId } from "@/shared/actions";

/**
 * The transcript, and the four things the panel can do to a turn.
 *
 * The panel does not own the thread. The worker writes it to
 * `chrome.storage.session` and this subscribes to that store, so a turn that arrived
 * while the panel was closed is simply there on the next open — and there is never a
 * second copy of the conversation to disagree with the first.
 *
 * Every `chrome.*` call in the chat flow is in this file. The components below take
 * props and render.
 */

export interface ChatView {
  turns: Turn[];
  /** True until the first read of storage comes back. */
  loading: boolean;
}

export function useChat(tabId: number | undefined): ChatView {
  /**
   * The transcript, stamped with the tab it belongs to.
   *
   * Stored together rather than as two pieces of state, so switching tabs can never
   * show the previous tab's thread for a frame: if the stamp doesn't match the tab we
   * are being asked about, there is nothing loaded for it yet. That also means
   * `loading` is derived rather than toggled, and no state is set while the effect
   * body runs.
   */
  const [loaded, setLoaded] = useState<{ tabId: number; turns: Turn[] }>();

  useEffect(() => {
    if (tabId === undefined) return;

    let live = true;
    const key = chatKey(tabId);

    const read = (value: unknown) => {
      setLoaded({ tabId, turns: isTranscript(value) ? value : [] });
    };

    void chrome.storage.session.get(key).then((stored) => {
      if (live) read(stored[key]);
    });

    // The worker is the only writer, so a change on this key is always news rather
    // than an echo of something this panel did.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      const change = changes[key];
      if (change) read(change.newValue);
    };

    chrome.storage.session.onChanged.addListener(onChanged);

    return () => {
      live = false;
      chrome.storage.session.onChanged.removeListener(onChanged);
    };
  }, [tabId]);

  const fresh = loaded !== undefined && loaded.tabId === tabId;

  return {
    turns: fresh ? loaded.turns : [],
    // With no tab there is nothing to wait for, so that is not a loading state.
    loading: tabId !== undefined && !fresh,
  };
}

/**
 * Ask for a plan.
 *
 * Resolves when the turn is over, which can be twenty seconds. The caller does not
 * need the result — the transcript is where the answer lands — but it does need to
 * know the turn finished, so the composer can come back.
 */
export async function sendMessage(text: string): Promise<void> {
  try {
    await sendToRuntime({ type: "PLAN_REQUEST", message: text });
  } catch {
    // The worker answered with an error rather than a turn. It has already written a
    // system note saying so, and that is what the user should read — not a second
    // message invented here.
  }
}

export async function approvePlan(turnId: string, rows: readonly ApprovedRow[]): Promise<void> {
  try {
    await sendToRuntime({ type: "PLAN_APPROVE", turnId, rows: [...rows] });
  } catch {
    // The state and the transcript both come from storage, so whatever happened is
    // already on its way to the panel.
  }
}

export async function cancelPlan(turnId: string): Promise<void> {
  try {
    await sendToRuntime({ type: "PLAN_CANCEL", turnId });
  } catch {
    // Nothing touched the page, which is the only guarantee cancel has to keep.
  }
}

/**
 * `I've done it — continue`.
 *
 * Resolves when the re-read is done, which is what lets the banner sit in its
 * checking state for exactly as long as the page is being looked at. The outcome is
 * returned rather than read from storage because "the step is still there" and "the
 * page could not be reached" both leave the tab at `CHECKPOINT` and the banner needs
 * to tell them apart.
 */
export async function continueFromCheckpoint(): Promise<void> {
  try {
    await sendToRuntime({ type: "CHECKPOINT_CONTINUE" });
  } catch {
    // The state and the transcript both come from storage, so whatever the worker
    // decided is already on its way here.
  }
}

/** `Cancel this plan`. Nothing further is sent; the transcript keeps a line saying so. */
export async function cancelCheckpoint(): Promise<void> {
  try {
    await sendToRuntime({ type: "CHECKPOINT_CANCEL" });
  } catch {
    // Nothing was pending to cancel. The banner goes either way.
  }
}

/**
 * `Try again` on one row.
 *
 * The result is written onto the turn by the worker, so the row updates in place
 * through the transcript subscription rather than from this return value. Awaited
 * only so the button can show that something is happening.
 */
export async function retryAction(turnId: string, actionId: string): Promise<void> {
  try {
    await sendToRuntime({ type: "ACTION_RETRY", turnId, actionId });
  } catch {
    // The run is gone, or the tab moved. The row keeps the outcome it had.
  }
}

/**
 * `Show me` — point at a field *and* scroll the page to it.
 *
 * Separate from `highlightField` because the scroll is the difference: a hover must
 * never move the page under someone who is reading it, and this is the one case
 * where moving the page is the whole request.
 */
export function revealField(fieldId: FieldId): void {
  void sendToRuntime({ type: "FIELD_HIGHLIGHT", fieldId, reveal: true }).catch(() => {
    // No content script on this tab. Expected after a navigation.
  });
}

/**
 * Point at a field on the page, or stop pointing.
 *
 * Fire and forget: a hover that fails to draw must never interrupt what the user was
 * reading, and the row already states the field's label in text. The highlight is an
 * aid, never the only signal.
 */
export function highlightField(fieldId?: FieldId): void {
  void sendToRuntime({
    type: "FIELD_HIGHLIGHT",
    ...(fieldId === undefined ? {} : { fieldId }),
  }).catch(() => {
    // No content script on this tab. Expected after a navigation.
  });
}
