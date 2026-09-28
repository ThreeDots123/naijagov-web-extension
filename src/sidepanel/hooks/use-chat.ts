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
