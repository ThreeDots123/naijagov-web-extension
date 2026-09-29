import { useEffect, useId, useRef, useState } from "react";
import type { FieldId } from "@/shared/actions";
import type { CopilotTurn } from "@/shared/chat";
import type { ApprovedRow } from "@/shared/messages";
import type { Plan, PlannedRow } from "@/shared/plan";
import { Check } from "@/sidepanel/components/icons";
import { BlockedSection } from "@/sidepanel/components/preview/blocked-section";
import { MissingChips } from "@/sidepanel/components/preview/missing-chips";
import { PreviewRow } from "@/sidepanel/components/preview/preview-row";
import type { RunProgress } from "@/sidepanel/hooks/use-run-progress";

/**
 * The gate.
 *
 * Nothing on the page changes until `Fill selected` is pressed. This card is not a
 * progress report — it is the moment the user reads what is about to happen to their
 * form and agrees to it, or doesn't.
 *
 * The selection and any corrections live here, in the open card, and travel with the
 * approval. There is deliberately no second copy in storage: the card on screen is
 * what the user agreed to, so the card on screen is what gets sent.
 */

/** Only the actions that write something are the user's to approve. */
function fillableRows(plan: Plan): PlannedRow[] {
  return plan.actions.filter(
    (row) => row.type === "fill" || row.type === "select" || row.type === "check",
  );
}

export interface FillPreviewProps {
  turn: CopilotTurn;
  plan: Plan;
  /** True while something else is in flight. The controls stay visible but inert. */
  disabled: boolean;
  onApprove: (turnId: string, rows: readonly ApprovedRow[]) => void;
  onCancel: (turnId: string) => void;
  onAsk: (question: string) => void;
  onPoint: (fieldId?: FieldId) => void;
  /** Present only while this turn's batch is running. */
  progress?: RunProgress;
}

export function FillPreview({
  turn,
  plan,
  disabled,
  onApprove,
  onCancel,
  onAsk,
  onPoint,
  progress,
}: FillPreviewProps) {
  const headingId = useId();
  const rows = fillableRows(plan);

  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});
  const selectAllRef = useRef<HTMLInputElement>(null);

  const chosen = rows.filter((row) => !unchecked.has(row.actionId));
  const allChosen = chosen.length === rows.length;

  // A partial selection is neither checked nor unchecked, and `indeterminate` is not a
  // React prop — it has to be set on the node after it renders.
  useEffect(() => {
    const node = selectAllRef.current;
    if (node) node.indeterminate = chosen.length > 0 && !allChosen;
  }, [chosen.length, allChosen]);

  // Everything but `pending` is history. The turn stays in the transcript so the user
  // can scroll back to what was proposed; none of it is actionable any more.
  if (turn.status !== "pending") {
    return (
      <CollapsedPreview
        turn={turn}
        total={rows.length}
        {...(progress === undefined ? {} : { progress })}
      />
    );
  }

  function toggle(actionId: string, checked: boolean) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (checked) next.delete(actionId);
      else next.add(actionId);

      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setUnchecked(checked ? new Set() : new Set(rows.map((row) => row.actionId)));
  }

  function approve() {
    onApprove(
      turn.id,
      chosen.map((row) => {
        const edited = edits[row.actionId];

        return { actionId: row.actionId, ...(edited === undefined ? {} : { value: edited }) };
      }),
    );
  }

  const considered = rows.length + plan.rejected.length;

  return (
    <section
      role="group"
      aria-labelledby={headingId}
      className="mt-2.5 rounded-[10px] border border-rule bg-page p-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex-none">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allChosen}
            disabled={disabled}
            onChange={(event) => toggleAll(event.target.checked)}
            aria-label="Select all fields"
            className="size-4.5 appearance-none rounded border border-rule bg-surface checked:border-green-900 checked:bg-green-900 disabled:opacity-50"
          />
          {allChosen ? (
            <Check
              size={13}
              className="pointer-events-none absolute left-[3px] top-[3px] text-white"
            />
          ) : null}
        </span>

        <h3 id={headingId} className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
          I can fill {rows.length} of {considered}{" "}
          {considered === 1 ? "field" : "fields"}
        </h3>
      </div>

      <ul className="mt-2.5 flex flex-col gap-2">
        {rows.map((row) => (
          <PreviewRow
            key={row.actionId}
            row={row}
            checked={!unchecked.has(row.actionId)}
            {...(edits[row.actionId] === undefined ? {} : { edited: edits[row.actionId] })}
            onToggle={(checked) => toggle(row.actionId, checked)}
            onEdit={(value) => setEdits((current) => ({ ...current, [row.actionId]: value }))}
            onPoint={onPoint}
          />
        ))}
      </ul>

      <BlockedSection rows={plan.rejected} />
      <MissingChips items={plan.missing} onAsk={onAsk} disabled={disabled} />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={disabled || chosen.length === 0}
          className="min-h-9 flex-1 rounded-full bg-green-900 px-3 text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-green-700 disabled:opacity-40 disabled:hover:bg-green-900"
        >
          Fill selected
        </button>

        <button
          type="button"
          onClick={() => onCancel(turn.id)}
          disabled={disabled}
          className="min-h-9 rounded-full border border-rule bg-surface px-3.5 text-[13.5px] font-medium text-ink-muted transition-colors duration-150 hover:border-ink-faint hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

interface CollapsedPreviewProps {
  turn: CopilotTurn;
  total: number;
  progress?: RunProgress;
}

/**
 * The card after it has been answered.
 *
 * One line, because the transcript's job now is to let the user scroll back and see
 * that this happened — not to keep offering a decision they have already made. While
 * the batch is running that same line carries the counter: eight fields produce one
 * line that counts, not eight lines that arrive.
 */
function CollapsedPreview({ turn, total, progress }: CollapsedPreviewProps) {
  const summary = (() => {
    switch (turn.status) {
      case "approved": {
        const approved = turn.approvedCount ?? total;

        if (!progress) {
          return `Filling ${approved} of ${total} ${total === 1 ? "field" : "fields"}.`;
        }

        // Ahead of the engine's own timeout, so the panel is the first to admit
        // something is wrong rather than sitting on a number that has stopped moving.
        if (progress.stalled) return "This is taking longer than expected…";

        // The one in flight, not the one just finished: "Filling 3 of 8" should name
        // the field the user can watch being written.
        const batch = progress.total || approved;

        return `Filling ${Math.min(progress.done + 1, batch)} of ${batch}…`;
      }
      case "cancelled":
        return "Cancelled — nothing on the page was changed.";
      case "stale":
        return "The page changed, so this plan was discarded.";
      default:
        return undefined;
    }
  })();


  if (!summary) return null;

  return (
    <p className="mt-2 rounded-lg border border-rule bg-page px-2.5 py-1.5 text-[12.5px] leading-[1.4] text-ink-muted">
      {summary}
    </p>
  );
}
