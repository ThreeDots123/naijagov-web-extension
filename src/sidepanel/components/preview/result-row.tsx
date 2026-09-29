import type { FieldId } from "@/shared/actions";
import type { ActionResult } from "@/shared/results";
import { Rotate, Target } from "@/sidepanel/components/icons";
import { describeResult, statusWord } from "@/sidepanel/lib/results-copy";

/**
 * One field, and what became of it.
 *
 * A failed row is not a dead end. "A form-filling tool that reports a failure and
 * stops is a slower way to make the user do it themselves" — so a row that needs the
 * user offers to point at the field, and a value the page refused offers to go again.
 *
 * `Try again` is offered for `NOT_ACCEPTED` alone, and the narrowness is the point:
 * that is the one failure where nothing was wrong with the action and the page simply
 * did not take the value. A locked field, a custom picker and a refused option are
 * not going to behave differently on a second press, and a button that pretends
 * otherwise is a button that wastes someone's afternoon.
 */

/** Both buttons name the field, so they are still distinguishable read out of order. */
const NO_LABEL = "this field";

export interface ResultRowProps {
  result: ActionResult;
  /** From the plan the user approved — the only place a label exists. */
  label?: string;
  retrying: boolean;
  onShow: (fieldId: FieldId) => void;
  onRetry: (actionId: string) => void;
}

export function ResultRow({ result, label, retrying, onShow, onRetry }: ResultRowProps) {
  const named = label && label.length > 0 ? label : NO_LABEL;
  const { fieldId } = result;
  const canRetry = result.reason === "NOT_ACCEPTED";

  return (
    <li className="rounded-lg border border-rule bg-surface px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-[1.35] text-ink">
          {named}
        </p>

        {/*
          The status in words beside the row, never colour alone. Someone who cannot
          tell the amber row from the green one reads the same thing either way.
        */}
        <span className="flex-none text-[11.5px] font-medium text-ink-faint">
          {statusWord(result.status)}
        </span>
      </div>

      <p className="mt-0.5 text-[12.5px] leading-[1.4] text-ink-muted">
        {describeResult(result)}
      </p>

      {fieldId !== undefined ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <RowButton
            label={`Show me ${named}`}
            onClick={() => onShow(fieldId)}
            icon={<Target size={12} />}
          >
            Show me
          </RowButton>

          {canRetry ? (
            <RowButton
              label={`Try ${named} again`}
              onClick={() => onRetry(result.actionId)}
              disabled={retrying}
              icon={<Rotate size={12} />}
            >
              {retrying ? "Trying…" : "Try again"}
            </RowButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

interface RowButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactElement;
  children: React.ReactNode;
}

function RowButton({ label, onClick, disabled = false, icon, children }: RowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex min-h-7 items-center gap-1 rounded-full border border-rule bg-page px-2.5 text-[12px] font-medium text-green-900 transition-colors duration-150 hover:border-green-900/40 hover:bg-green-50/60 disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}
