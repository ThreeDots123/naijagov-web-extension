import { useId, useState } from "react";
import { PaperPlane, Paperclip } from "@/sidepanel/components/icons";

/**
 * The composer.
 *
 * Fixed to the bottom with the body scrolling behind it, because the transcript
 * that arrives in the next task will grow into that space.
 */

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** No token, or stopped at a checkpoint. The field takes its own placeholder. */
  disabled: boolean;
  placeholder: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: ComposerProps) {
  const canSend = !disabled && value.trim().length > 0;

  return (
    <div className="flex-none border-t border-rule bg-surface p-3">
      <div className="flex min-h-12 items-end gap-2 rounded-full border border-rule bg-page py-1 pl-3 pr-1.5 transition-colors duration-150 focus-within:border-green-900">
        <AttachButton />

        <textarea
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter newlines. Expected behaviour in a chat
            // field on a keyboard, so it needs no hint text. `isComposing`
            // guards an IME's own Enter, which must not send.
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            if (canSend) onSubmit();
          }}
          className="min-h-8 max-h-20 min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 text-[14px] leading-5 text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed focus-visible:outline-0! focus-visible:outline-offset-0 field-sizing-content"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label="Send message"
          className={`inline-flex size-9 flex-none items-center justify-center self-center rounded-full bg-green-900 text-white transition-colors duration-150 hover:bg-green-700 ${
            canSend ? "" : "pointer-events-none"
          } ${disabled ? "opacity-40" : "disabled:opacity-30"}`}
        >
          <PaperPlane size={16} solid />
        </button>
      </div>
    </div>
  );
}

/**
 * The paperclip, present but inactive.
 *
 * Document upload is post-hackathon. It renders anyway so the composer matches
 * the design and so the control's absence isn't mistaken for a missing feature —
 * but it says so when touched rather than failing silently.
 *
 * `aria-disabled` rather than `disabled`: a `disabled` button takes no pointer
 * events and no focus, which would make the tooltip unreachable by exactly the
 * people most likely to wonder where the feature went.
 */
function AttachButton() {
  const [showTip, setShowTip] = useState(false);
  const tipId = useId();

  return (
    <div className="relative flex-none self-center">
      <button
        type="button"
        aria-disabled
        aria-describedby={tipId}
        aria-label="Attach a document"
        onClick={() => setShowTip(true)}
        onPointerEnter={() => setShowTip(true)}
        onPointerLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        className="inline-flex size-8 cursor-default items-center justify-center rounded-full text-ink-faint opacity-45"
      >
        <Paperclip size={18} />
      </button>

      {/*
        Anchored to the button's left edge and clamped to the panel, so it cannot
        push a 320px panel sideways.
      */}
      <div
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-max max-w-55 rounded-md bg-ink px-2 py-1 text-[12px] leading-[1.4] text-white transition-opacity duration-150 ${
          showTip ? "opacity-100" : "opacity-0"
        }`}
      >
        Attaching documents is coming soon.
      </div>
    </div>
  );
}
