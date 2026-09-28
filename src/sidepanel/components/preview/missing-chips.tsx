import { useId } from "react";
import type { MissingItem } from "@/shared/plan";

/**
 * The questions the Copilot needs answered.
 *
 * The backend phrases these for a person — "What's your LGA?" — so tapping one puts it
 * in the composer and the user answers it directly, rather than being told a fill
 * failed and left to work out what was wanted.
 *
 * Buttons, not links or divs: they do something, they are in the tab order for free,
 * and they take the panel's focus ring without any help.
 */

export interface MissingChipsProps {
  items: readonly MissingItem[];
  /** Loads the question into the composer. */
  onAsk: (question: string) => void;
  disabled: boolean;
}

export function MissingChips({ items, onAsk, disabled }: MissingChipsProps) {
  const headingId = useId();

  if (items.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mt-3 border-t border-rule pt-3">
      <h4 id={headingId} className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {items.length === 1 ? "1 detail I don't have" : `${items.length} details I don't have`}
      </h4>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.fieldId}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAsk(item.question)}
              className="max-w-full rounded-full border border-rule bg-page px-2.5 py-1 text-left text-[12.5px] leading-[1.35] text-ink transition-colors duration-150 hover:border-green-900/40 hover:bg-green-50/50 disabled:opacity-50 disabled:hover:border-rule disabled:hover:bg-page"
            >
              {item.question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
