import { useCallback, useEffect, useRef, useState } from "react";
import { sendToRuntime } from "@/shared/messages";
import type { BackendStatus } from "@/sidepanel/hooks/use-backend-health";

/**
 * The `Check connection` button's brain.
 *
 * It verifies both halves of the pipe at once — can we reach the page, and can
 * the worker reach the backend — because a user who clicks this wants one
 * answer, not two buttons. The result is written in place beneath the button.
 *
 * This lives in a hook rather than in the strip because the strip is
 * presentational: messaging goes through `chrome.runtime`, and the panel keeps
 * every one of those calls inside `hooks/`.
 */

/** A page that hasn't answered in four seconds is not going to. */
const TIMEOUT_MS = 4000;
/** Long enough that a stuck user can't queue twenty pings in frustration. */
const COOLDOWN_MS = 3000;
/** How often the "just now" on a finished check is re-evaluated. */
const AGE_TICK_MS = 30_000;

export type ConnectionResult =
  | { kind: "none" }
  | { kind: "ok"; elementCount: number; ago: string }
  | { kind: "page-unreachable" }
  | { kind: "backend-down" };

export interface ConnectionCheck {
  result: ConnectionResult;
  running: boolean;
  /** False while running and through the cooldown that follows. */
  canRun: boolean;
  run: () => void;
}

export function useConnectionCheck(
  checkBackend: () => Promise<Exclude<BackendStatus, "checking">>,
): ConnectionCheck {
  const [result, setResult] = useState<StoredResult>({ kind: "none" });
  const [running, setRunning] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A second click in the same tick would slip past `running`, which React has
  // not committed yet. The ref is the actual gate; the state is what the button
  // renders from.
  const busyRef = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(cooldownTimer.current);
    };
  }, []);

  // Only ticks while a successful result is on screen, so an idle panel is not
  // waking up every thirty seconds to recompute a string nobody is reading.
  useEffect(() => {
    if (result.kind !== "ok") return;

    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(id);
  }, [result.kind]);

  const run = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRunning(true);

    void (async () => {
      const [page, backend] = await Promise.all([pingPage(), checkBackendSafely(checkBackend)]);

      // The page comes first when both are down. It is the half the user is
      // looking at and the half they can fix themselves, by reloading.
      if (!page.ok) {
        setResult({ kind: "page-unreachable" });
      } else if (backend === "offline") {
        setResult({ kind: "backend-down" });
      } else {
        setResult({ kind: "ok", elementCount: page.elementCount, at: Date.now() });
        setNow(Date.now());
      }

      setRunning(false);
      setCooling(true);
      cooldownTimer.current = setTimeout(() => {
        setCooling(false);
        busyRef.current = false;
      }, COOLDOWN_MS);
    })();
  }, [checkBackend]);

  return {
    result: result.kind === "ok" ? { ...result, ago: describeAge(result.at, now) } : result,
    running,
    canRun: !running && !cooling,
    run,
  };
}

/** What we keep: an absolute timestamp. `ago` is derived at render. */
type StoredResult =
  | { kind: "none" }
  | { kind: "ok"; elementCount: number; at: number }
  | { kind: "page-unreachable" }
  | { kind: "backend-down" };

async function pingPage(): Promise<{ ok: true; elementCount: number } | { ok: false }> {
  try {
    const pong = await withTimeout(sendToRuntime({ type: "PING" }));
    return { ok: true, elementCount: pong.elementCount };
  } catch {
    // Every failure reads the same to the user: no tab, an unsupported page, a
    // content script that never attached. The fix — reload — is the same too.
    return { ok: false };
  }
}

async function checkBackendSafely(
  checkBackend: () => Promise<Exclude<BackendStatus, "checking">>,
): Promise<Exclude<BackendStatus, "checking">> {
  try {
    return await withTimeout(checkBackend());
  } catch {
    return "offline";
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Timed out.")), TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function describeAge(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}
