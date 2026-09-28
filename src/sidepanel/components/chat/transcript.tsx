import { useEffect, useRef } from "react";
import type { FieldId } from "@/shared/actions";
import type { CopilotTurn, Turn, UserTurn } from "@/shared/chat";
import type { ApprovedRow } from "@/shared/messages";
import { Sources } from "@/sidepanel/components/chat/sources";
import { SystemNote } from "@/sidepanel/components/chat/system-note";
import { FillPreview } from "@/sidepanel/components/preview/fill-preview";

/**
 * The conversation.
 *
 * A plan is rendered as a card attached to the Copilot's turn rather than as a screen
 * of its own, because the reply and the plan are one answer: "Here's what I found, and
 * here's what I'd fill" is a sentence, not two pages.
 *
 * Auto-scroll follows new turns, and stops the moment the user scrolls up — reading
 * back through a plan while the view keeps yanking to the bottom is worse than no
 * auto-scroll at all.
 */

export interface TranscriptProps {
  turns: readonly Turn[];
  /** Something is in flight: the three-dot indicator shows and controls go inert. */
  thinking: boolean;
  onApprove: (turnId: string, rows: readonly ApprovedRow[]) => void;
  onCancel: (turnId: string) => void;
  onAsk: (question: string) => void;
  onRetry: (message: string) => void;
  onPoint: (fieldId?: FieldId) => void;
}

export function Transcript({
  turns,
  thinking,
  onApprove,
  onCancel,
  onAsk,
  onRetry,
  onPoint,
}: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Only scrolls when the user was already at the bottom. `atBottomRef` is written by
  // the scroll handler on the container in `App`, via `data-at-bottom` — see below.
  useEffect(() => {
    if (!atBottomRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, thinking]);

  // The nearest scrollable ancestor is the panel's `<main>`, which this does not own.
  // Listening from here keeps the ownership right: the transcript decides what
  // "at the bottom" means for its own auto-scroll.
  useEffect(() => {
    const scroller = endRef.current?.closest("[data-scroller]");
    if (!(scroller instanceof HTMLElement)) return;

    const onScroll = () => {
      const slack = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      atBottomRef.current = slack < 32;
    };

    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });

    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {turns.map((turn) => {
        switch (turn.role) {
          case "user":
            return <UserBubble key={turn.id} turn={turn} />;

          case "copilot":
            return (
              <CopilotBubble
                key={turn.id}
                turn={turn}
                disabled={thinking}
                onApprove={onApprove}
                onCancel={onCancel}
                onAsk={onAsk}
                onPoint={onPoint}
              />
            );

          case "system":
            return (
              <SystemNote
                key={turn.id}
                turn={turn}
                {...(thinking ? {} : { onRetry })}
              />
            );
        }
      })}

      {thinking ? <Thinking /> : null}

      <div ref={endRef} aria-hidden />
    </div>
  );
}

function UserBubble({ turn }: { turn: UserTurn }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] rounded-br-sm bg-green-50 px-3 py-2 text-[14.5px] leading-[1.45] text-ink">
        {turn.text}
      </p>
    </div>
  );
}

interface CopilotBubbleProps {
  turn: CopilotTurn;
  disabled: boolean;
  onApprove: (turnId: string, rows: readonly ApprovedRow[]) => void;
  onCancel: (turnId: string) => void;
  onAsk: (question: string) => void;
  onPoint: (fieldId?: FieldId) => void;
}

function CopilotBubble({
  turn,
  disabled,
  onApprove,
  onCancel,
  onAsk,
  onPoint,
}: CopilotBubbleProps) {
  return (
    <div className="flex gap-2.5">
      <span className="n-mark mt-0.5 size-5 flex-none text-green-900" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.5] text-ink">
          {turn.text}
        </p>

        {turn.plan ? (
          <>
            <Sources citations={turn.plan.citations} grounding={turn.plan.grounding} />

            <FillPreview
              turn={turn}
              plan={turn.plan}
              disabled={disabled}
              onApprove={onApprove}
              onCancel={onCancel}
              onAsk={onAsk}
              onPoint={onPoint}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Three dots where the reply will be.
 *
 * In place of the answer rather than beside it, so the position of the thing the user
 * is waiting for doesn't move when it arrives. The animation is one of the two in the
 * product and it stops under `prefers-reduced-motion`, where the dots hold still.
 */
function Thinking() {
  return (
    <div className="flex gap-2.5">
      <span className="n-mark mt-0.5 size-5 flex-none text-green-900" aria-hidden />

      <div className="flex items-center gap-1 py-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="dot-pulse size-1.5 rounded-full bg-ink-faint"
            style={{ animationDelay: `${index * 0.18}s` }}
          />
        ))}
        <span className="sr-only">Thinking</span>
      </div>
    </div>
  );
}
