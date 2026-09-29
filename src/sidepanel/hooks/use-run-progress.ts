import { useEffect, useState } from "react";
import { isMessage } from "@/shared/messages";

/**
 * How far through a batch the page has got.
 *
 * One line, not a transcript. Eight fields produce "Filling 3 of 8…", not eight chat
 * messages — the page is where the action is visible, and a panel narrating each
 * field is competing with the thing the user is actually watching.
 *
 * Deliberately **not** in `chrome.storage.session`. A counter that ticked eight times
 * in six hundred milliseconds would be eight storage writes and eight broadcasts for
 * a number nobody needs after the run ends. A panel opened mid-run shows the total
 * from the approved turn and no counter, which is the honest thing for it to say.
 */

/** Ahead of the engine's own ten-second timeout, so the panel speaks first. */
const STALL_MS = 6_000;

export interface RunProgress {
  /** Actions finished so far. */
  done: number;
  total: number;
  /** Nothing has moved for six seconds. The line says so. */
  stalled: boolean;
}

export function useRunProgress(executing: boolean): RunProgress | undefined {
  const [progress, setProgress] = useState<RunProgress>();

  // Reset during render rather than in an effect. A run ending and the next one
  // starting is a prop change, and clearing it here means the counter is never shown
  // for one frame against the batch that has already finished.
  const [wasExecuting, setWasExecuting] = useState(executing);
  if (wasExecuting !== executing) {
    setWasExecuting(executing);
    setProgress(undefined);
  }

  useEffect(() => {
    if (!executing) return;

    const onMessage = (message: unknown) => {
      if (!isMessage(message) || message.type !== "ACTION_PROGRESS") return;

      setProgress({
        // `index` is zero-based and names the action that just *finished*.
        done: message.index + 1,
        total: message.total,
        stalled: false,
      });
    };

    chrome.runtime.onMessage.addListener(onMessage);

    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [executing]);

  // Restarted by every arriving count, so the message appears only when the run has
  // genuinely gone quiet rather than six seconds after it began.
  useEffect(() => {
    if (!executing) return;

    const timer = setTimeout(() => {
      setProgress((current) =>
        current ? { ...current, stalled: true } : { done: 0, total: 0, stalled: true },
      );
    }, STALL_MS);

    return () => clearTimeout(timer);
  }, [executing, progress?.done]);

  return progress;
}
