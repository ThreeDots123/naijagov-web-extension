import type { SystemTurn } from "@/shared/chat";
import { isRetryable } from "@/shared/plan";

/**
 * A failed turn.
 *
 * Styled as a note from the extension, not as a Copilot turn. The Copilot saying "I
 * can't reach the assistant" would be the Copilot claiming to have spoken when it
 * never ran, and the difference matters: one is the assistant's answer, the other is
 * the plumbing failing.
 *
 * The text is whatever the backend sent, printed verbatim. The panel never invents a
 * technical explanation of its own over the top of one.
 */

export interface SystemNoteProps {
  turn: SystemTurn;
  /** Resends the message that failed. Absent while the panel is busy. */
  onRetry?: (message: string) => void;
}

export function SystemNote({ turn, onRetry }: SystemNoteProps) {
  // A note with no code is not a failure, so there is nothing to retry.
  const canRetry =
    onRetry !== undefined &&
    turn.retryMessage !== undefined &&
    turn.code !== undefined &&
    isRetryable(turn.code);

  return (
    <div role="note" className="rounded-lg border border-rule bg-page px-2.5 py-2">
      <p className="text-[12.5px] leading-[1.45] text-ink-muted">{turn.text}</p>

      {turn.retryAfter !== undefined ? (
        <p className="mt-0.5 text-[11.5px] leading-[1.4] text-ink-faint">
          Try again in {turn.retryAfter} {turn.retryAfter === 1 ? "second" : "seconds"}.
        </p>
      ) : null}

      {canRetry ? (
        <button
          type="button"
          onClick={() => onRetry(turn.retryMessage as string)}
          className="mt-1.5 rounded-full border border-rule bg-surface px-2.5 py-0.5 text-[12px] font-medium text-green-900 transition-colors duration-150 hover:border-green-900/40 hover:bg-green-50/50"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
