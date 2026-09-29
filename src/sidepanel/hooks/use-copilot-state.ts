import { useEffect, useState } from "react";
import { matchesSupportedHost } from "@/shared/hosts";
import { isMessage } from "@/shared/messages";
import type { SensitiveKind } from "@/shared/page";
import type { CopilotState, SessionState } from "@/shared/state";
import { isSessionState, sessionKey } from "@/shared/state";

/**
 * What the Copilot is doing, and what page it is doing it to.
 *
 * The state and the tab arrive together because the panel never wants one
 * without the other: `READY` means nothing until you know whether the page
 * underneath is one we support.
 *
 * Read from `chrome.storage.session` on mount — the worker may have moved the
 * state on while the panel was closed — then kept current by the worker's
 * `STATE_CHANGED` broadcast. The panel only ever reads this. The worker writes it.
 */

/**
 * Why the page is paused, and what the banner needs to say about it.
 *
 * Read from storage rather than from the `CHECKPOINT_DETECTED` broadcast, because
 * the user is going to close the panel and go and do the step. A banner that lived
 * in a message would be gone when they came back — which is the one moment it has to
 * still be there.
 */
export interface CheckpointView {
  /** The sentence, from `SENSITIVE_REASONS`. Never improvised in the panel. */
  reason: string;
  kind: SensitiveKind;
  /** Approved actions this cancelled. Zero when there was nothing pending. */
  cancelled: number;
  /** A resume came back and the step was still there. Softens the wording. */
  unfinished: boolean;
}

export interface CopilotStateView {
  state: CopilotState;
  /** Present only at `CHECKPOINT`. */
  checkpoint: CheckpointView | undefined;
  /** Is this page one of our host matches? Decides `READY`'s two readings. */
  supported: boolean;
  /** The active tab's URL, for the expanded detail. Undefined before the first read. */
  url: string | undefined;
  /**
   * Which tab this describes.
   *
   * Exposed because the transcript is stored per tab and the panel has to know which
   * key to read. Undefined before the first query, and while no tab is active.
   */
  tabId: number | undefined;
}

export function useCopilotState(): CopilotStateView {
  const [session, setSession] = useState<SessionState>();
  const [state, setState] = useState<CopilotState>("IDLE");
  const [url, setUrl] = useState<string>();
  const [tabId, setTabId] = useState<number>();

  // Which tab we are looking at. Re-read on a switch and on a navigation,
  // because both change the answer to every question below.
  useEffect(() => {
    let live = true;

    const read = () => {
      void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => {
        if (!live) return;
        setUrl(active?.url);
        setTabId(active?.id);
      });
    };

    read();

    const onActivated = () => read();
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
      if (changeInfo.status === "complete" || changeInfo.url !== undefined) read();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      live = false;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  // What the worker last wrote for this tab. Read on mount, because it may have moved
  // the state on while the panel was closed, and then kept current by subscribing to
  // the store itself — the checkpoint's own details change without the *state*
  // changing, so a `STATE_CHANGED` broadcast alone would miss the resume that comes
  // back unfinished.
  // A tab switch drops the previous tab's state during render, for the same reason
  // `use-chat` stamps its transcript with a tab: showing the tab you just left, for
  // one frame, is showing the wrong page's checkpoint.
  const [lastTabId, setLastTabId] = useState(tabId);
  if (lastTabId !== tabId) {
    setLastTabId(tabId);
    setSession(undefined);
  }

  useEffect(() => {
    if (tabId === undefined) return;

    let live = true;
    const key = sessionKey(tabId);

    const read = (value: unknown) => {
      const next = isSessionState(value) ? value : undefined;
      setSession(next);
      setState(next?.state ?? "IDLE");
    };

    void chrome.storage.session.get(key).then((stored) => {
      if (live) read(stored[key]);
    });

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

  // Kept current by the worker's broadcast. A separate subscription from the
  // read above, so switching tabs doesn't tear the listener down and back up.
  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (isMessage(message) && message.type === "STATE_CHANGED") setState(message.state);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const current: CopilotState = tabId === undefined ? "IDLE" : state;

  return {
    // Derived, not stored: with no tab there is nothing to be in a state about,
    // and deriving it means no stale state survives a switch to one.
    state: current,
    // Derived from the state rather than from the presence of a stored reason, so a
    // reason left behind by a cleared checkpoint can never put the banner back.
    checkpoint: current === "CHECKPOINT" ? checkpointOf(session) : undefined,
    supported: matchesSupportedHost(url),
    url,
    tabId,
  };
}

/** The stored fields, with the defaults a checkpoint raised before this build lacks. */
function checkpointOf(session: SessionState | undefined): CheckpointView {
  return {
    reason: session?.checkpointReason ?? "This page needs you to take over.",
    kind: session?.checkpointKind ?? "unknown",
    cancelled: session?.checkpointCancelled ?? 0,
    unfinished: session?.checkpointUnfinished ?? false,
  };
}
