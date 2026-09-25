import { useEffect, useState } from "react";
import { matchesSupportedHost } from "@/shared/hosts";
import { isMessage } from "@/shared/messages";
import type { CopilotState } from "@/shared/state";
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

export interface CopilotStateView {
  state: CopilotState;
  /** Is this page one of our host matches? Decides `READY`'s two readings. */
  supported: boolean;
  /** The active tab's URL, for the expanded detail. Undefined before the first read. */
  url: string | undefined;
}

export function useCopilotState(): CopilotStateView {
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

  // What the worker last wrote for this tab. It may have moved the state on
  // while the panel was closed, so this is read rather than assumed.
  useEffect(() => {
    if (tabId === undefined) return;

    let live = true;
    const key = sessionKey(tabId);

    void chrome.storage.session.get(key).then((stored) => {
      const value = stored[key];
      if (live) setState(isSessionState(value) ? value.state : "IDLE");
    });

    return () => {
      live = false;
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

  return {
    // Derived, not stored: with no tab there is nothing to be in a state about,
    // and deriving it means no stale state survives a switch to one.
    state: tabId === undefined ? "IDLE" : state,
    supported: matchesSupportedHost(url),
    url,
  };
}
