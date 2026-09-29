import { Hand } from "@/sidepanel/components/icons";
import type { CheckpointView } from "@/sidepanel/hooks/use-copilot-state";

/**
 * The moment the product's central claim becomes visible.
 *
 * A takeover, not a notification: pinned above the composer, in the checkpoint
 * colour, with the status strip already red behind it. A toast that faded would be
 * the wrong shape for "you must do something now".
 *
 * Two things it deliberately does not do.
 *
 * It **does not cancel anything**. The engine cancelled the pending actions the
 * moment the detector fired, long before this rendered; the banner reports that
 * count and nothing more. A banner that performed the cancelling would be a banner
 * whose absence — a closed panel — meant actions kept running.
 *
 * And it **never explains how to get past the step**. It names the step and says the
 * user must do it. No guesses about where a code might have been sent, no note about
 * what a CAPTCHA usually wants. The sentence comes from `SENSITIVE_REASONS`, which is
 * written to that rule, and there is nowhere in this component to improvise one.
 */

export interface CheckpointBannerProps {
  checkpoint: CheckpointView;
  /** True while the re-read is in flight. The primary button goes inert. */
  checking: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

export function CheckpointBanner({
  checkpoint,
  checking,
  onContinue,
  onCancel,
}: CheckpointBannerProps) {
  const { reason, cancelled, unfinished } = checkpoint;

  return (
    <section
      // Assertive because it is blocking: a screen-reader user needs this now, not
      // after whatever is currently being read. Focus is *not* moved — the button is
      // simply the next stop from the composer, so nobody is thrown out of what they
      // were doing.
      aria-live="assertive"
      aria-label="Your turn"
      className="flex-none border-t border-state-checkpoint/25 bg-state-checkpoint/8 px-4 py-3"
    >
      <div className="flex gap-2.5">
        <Hand size={17} className="mt-px flex-none text-state-checkpoint" />

        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold leading-[1.3] text-state-checkpoint">
            Your turn
          </h2>

          <p className="mt-1 text-[13px] leading-[1.45] text-ink">
            {unfinished ? "It looks like that step still needs finishing." : reason}
          </p>

          {/*
            Said once, and only when there was something to stop. A run that finished
            and *then* hit a checkpoint cancelled nothing, and claiming otherwise
            would make the Copilot sound like it lost work it never had.
          */}
          {cancelled > 0 ? (
            <p className="mt-1 text-[12.5px] leading-[1.4] text-ink-muted">
              I&apos;ve stopped the {cancelled} remaining{" "}
              {cancelled === 1 ? "field" : "fields"}.
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onContinue}
              disabled={checking}
              className="min-h-9 rounded-full bg-state-checkpoint px-3.5 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-state-checkpoint/90 disabled:opacity-50"
            >
              {checking ? "Checking the page…" : "I've done it — continue"}
            </button>

            <button
              type="button"
              onClick={onCancel}
              disabled={checking}
              className="min-h-9 rounded-full px-2 text-[13px] font-medium text-ink-muted underline decoration-rule underline-offset-2 transition-colors duration-150 hover:text-ink disabled:opacity-50"
            >
              Cancel this plan
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
