import { useId } from "react";
import {
  ChatBubble,
  CornerDownRight,
  FileText,
  PaperPlane,
  type IconProps,
} from "@/sidepanel/components/icons";
import { Eyebrow } from "@/sidepanel/components/ui/eyebrow";
import { IconTile } from "@/sidepanel/components/ui/icon-tile";

/**
 * Three ways in.
 *
 * A quick prompt is not a command — it fills the composer with the sentence the
 * user would have typed and sends that. The AI never sees a button id, and the
 * user can see exactly what was asked on their behalf.
 */

interface Prompt {
  icon: (props: IconProps) => React.ReactElement;
  label: string;
}

const PROMPTS: readonly Prompt[] = [
  { icon: FileText, label: "Explain this page" },
  { icon: PaperPlane, label: "Help me navigate this website" },
  { icon: ChatBubble, label: "I have a different question" },
];

export interface QuickPromptsProps {
  /** Unconnected, or stopped at a checkpoint. Either way these do nothing useful. */
  disabled: boolean;
  onPick: (prompt: string) => void;
}

export function QuickPrompts({ disabled, onPick }: QuickPromptsProps) {
  const eyebrowId = useId();

  return (
    <section aria-labelledby={eyebrowId} className="mt-5">
      <Eyebrow id={eyebrowId}>QUICK PROMPTS</Eyebrow>

      <ul className="mt-2.5 flex flex-col gap-2.5">
        {PROMPTS.map(({ icon: Icon, label }) => (
          <li key={label}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(label)}
              className="flex min-h-[58px] w-full items-center gap-3 rounded-[10px] border border-rule bg-surface px-3 py-2 text-left transition-colors duration-150 hover:border-green-900/35 hover:bg-green-50/40 disabled:opacity-50 disabled:hover:border-rule disabled:hover:bg-surface"
            >
              <IconTile size={34}>
                <Icon size={17} />
              </IconTile>

              {/*
                Wraps to two lines at 320px rather than truncating. A prompt the
                user cannot finish reading is not a prompt.
              */}
              <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink">{label}</span>

              <CornerDownRight size={14} className="flex-none text-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
