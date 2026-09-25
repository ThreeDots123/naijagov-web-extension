import { useCallback, useEffect, useState } from "react";
import { sendToRuntime } from "@/shared/messages";
import type { HealthState } from "@/shared/state";
import { HEALTH_KEY } from "@/shared/state";

/**
 * Whether the backend is reachable.
 *
 * The panel cannot ask it directly — the service worker is the only context that
 * touches the network — so it asks through a message. A rejected promise is
 * `offline`, never a thrown error: during setup the backend genuinely is not
 * running, and that is a line of text, not a crash.
 *
 * Re-checked when the panel becomes visible again, because a panel left open for
 * an hour is showing an hour-old answer otherwise.
 */

export type BackendStatus = "checking" | "online" | "offline";

export interface BackendHealth {
  status: BackendStatus;
  /** Re-check now. Resolves to the outcome, so a caller can report on it. */
  check: () => Promise<Exclude<BackendStatus, "checking">>;
}

export function useBackendHealth(): BackendHealth {
  const [status, setStatus] = useState<BackendStatus>("checking");

  const check = useCallback(async (): Promise<Exclude<BackendStatus, "checking">> => {
    let next: Exclude<BackendStatus, "checking">;

    try {
      const result = await sendToRuntime({ type: "HEALTH_CHECK" });
      next = result.health.reachable ? "online" : "offline";
    } catch {
      next = "offline";
    }

    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let live = true;

    // Seed from whatever the last check found, so the strip is not "checking" on
    // every open when the worker already knows the answer, then confirm it. The
    // fresh check is chained rather than fired alongside so the cached answer
    // cannot land on top of the new one.
    void chrome.storage.session
      .get(HEALTH_KEY)
      .then((stored) => {
        const value = stored[HEALTH_KEY];
        if (live && isHealthState(value)) setStatus(value.reachable ? "online" : "offline");
      })
      .then(() => {
        if (live) return check();
        return undefined;
      });

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);

  return { status, check };
}

function isHealthState(value: unknown): value is HealthState {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { reachable?: unknown }).reachable === "boolean"
  );
}
