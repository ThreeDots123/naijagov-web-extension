import { useCallback, useEffect, useState } from "react";
import { isMessage, sendToRuntime } from "@/shared/messages";
import type { CopilotState, HealthState } from "@/shared/state";
import { HEALTH_KEY, isSessionState, sessionKey } from "@/shared/state";

/**
 * The panel's reads.
 *
 * The panel talks to Chrome directly for things about the browser — which tab is
 * open, what is in storage — and goes through the service worker for anything
 * that touches a page or the network. It never fetches.
 */

export type Loadable<T> = { status: "loading" } | { status: "ready"; value: T };

/**
 * The extension token, from `chrome.storage.local`.
 *
 * That storage is not encrypted. It holds the token and a profile cache and
 * nothing more sensitive, and the connect screen says so plainly.
 */
export function useToken(): Loadable<string | undefined> {
  const [token, setToken] = useState<Loadable<string | undefined>>({ status: "loading" });

  useEffect(() => {
    let live = true;

    void chrome.storage.local.get("token").then(({ token: stored }) => {
      if (!live) return;
      setToken({
        status: "ready",
        value: typeof stored === "string" && stored.length > 0 ? stored : undefined,
      });
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !("token" in changes)) return;
      const next = changes.token?.newValue;
      setToken({
        status: "ready",
        value: typeof next === "string" && next.length > 0 ? next : undefined,
      });
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return token;
}

/** The tab the panel is looking at, re-read when the user switches or navigates. */
export function useActiveTab(): chrome.tabs.Tab | undefined {
  const [tab, setTab] = useState<chrome.tabs.Tab>();

  useEffect(() => {
    let live = true;

    const read = () => {
      void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => {
        if (live) setTab(active);
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

  return tab;
}

/**
 * The current state for a tab.
 *
 * Read from `chrome.storage.session` on mount — the worker may have moved the
 * state on while the panel was closed — and then kept current by the worker's
 * `STATE_CHANGED` broadcast. The panel only ever reads this. The worker writes it.
 */
export function useCopilotState(tabId: number | undefined): CopilotState {
  const [state, setState] = useState<CopilotState>("IDLE");

  useEffect(() => {
    let live = true;

    if (tabId !== undefined) {
      const key = sessionKey(tabId);
      void chrome.storage.session.get(key).then((stored) => {
        const value = stored[key];
        if (live && isSessionState(value)) setState(value.state);
      });
    }

    const onMessage = (message: unknown) => {
      if (isMessage(message) && message.type === "STATE_CHANGED") setState(message.state);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      live = false;
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [tabId]);

  return state;
}

/**
 * Whether the backend is reachable.
 *
 * The panel cannot ask it directly, so it asks the worker, which is the only
 * context that touches the network. An unreachable backend is a line of text,
 * not an error state — during setup it genuinely is not running.
 */
export function useBackendHealth(): { health: HealthState | undefined; refresh: () => void } {
  const [health, setHealth] = useState<HealthState>();

  const refresh = useCallback(() => {
    void sendToRuntime({ type: "HEALTH_CHECK" })
      .then((result) => setHealth(result.health))
      .catch(() => setHealth({ reachable: false, checkedAt: Date.now() }));
  }, []);

  useEffect(() => {
    let live = true;

    // Whatever the last check found, so the panel is not blank while a new one runs.
    void chrome.storage.session.get(HEALTH_KEY).then((stored) => {
      const value = stored[HEALTH_KEY];
      if (live && isHealthState(value)) setHealth(value);
    });

    refresh();
    return () => {
      live = false;
    };
  }, [refresh]);

  return { health, refresh };
}

function isHealthState(value: unknown): value is HealthState {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { reachable?: unknown }).reachable === "boolean"
  );
}
