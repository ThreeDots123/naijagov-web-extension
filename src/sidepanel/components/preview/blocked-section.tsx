import { useId } from "react";
import type { BlockedRow } from "@/shared/plan";

/**
 * What the Copilot was asked to do and refused.
 *
 * Shown, never hidden. "This field needs you — I don't fill passwords or codes" reads
 * as careful; the same plan with the row quietly removed reads as a tool that missed
 * something. It also hides our own bugs.
 *
 * No checkboxes: there is nothing here for the user to approve. Their own heading and
 * a list, so a screen reader can reach it as a section rather than as loose text after
 * the rows.
 */

export interface BlockedSectionProps {
  rows: readonly BlockedRow[];
}

export function BlockedSection({ rows }: BlockedSectionProps) {
  const headingId = useId();

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mt-3 border-t border-rule pt-3">
      <h4
        id={headingId}
        className="text-[11px] font-semibold uppercase tracking-wide text-state-checkpoint"
      >
        {rows.length === 1 ? "1 suggestion blocked" : `${rows.length} suggestions blocked`}
      </h4>

      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row, index) => (
          <li
            // A blocked row carries no id of its own, and one field can be refused
            // twice for different reasons, so the reason is part of the key.
            key={`${row.fieldId ?? "page"}-${index}`}
            className="rounded-lg border border-state-checkpoint/30 bg-state-checkpoint/5 p-2.5"
          >
            {row.label ? (
              <p className="text-[13.5px] font-medium leading-[1.35] text-ink">{row.label}</p>
            ) : null}

            {/* The backend's sentence, verbatim. It says what the user must do and
                never how to get around it. */}
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-ink-muted">{row.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
