import { useEffect, useId, useRef, useState } from "react";
import type { FieldId } from "@/shared/actions";
import type { PlannedRow } from "@/shared/plan";
import { Check, Pencil, Warning } from "@/sidepanel/components/icons";

/**
 * One proposed fill, with its provenance and a way to correct it.
 *
 * The row is the product's promise in one piece of UI: the label, the value, where
 * the value came from, and a checkbox that means nothing happens unless the user says
 * so. A user who can see provenance spots a wrong mapping in a second; one who sees
 * only values has to go and check the form.
 */

export interface PreviewRowProps {
  row: PlannedRow;
  checked: boolean;
  /** The user's correction, when they have made one. */
  edited?: string;
  onToggle: (checked: boolean) => void;
  onEdit: (value: string) => void;
  /** Hover and focus both call this. Leaving calls it with nothing. */
  onPoint: (fieldId?: FieldId) => void;
}

/**
 * The short chip.
 *
 * The backend's own `source` is a sentence — "Your profile" — and it is used for the
 * accessible name, where a sentence reads better. The chip is the same fact in the
 * space a 360px panel has for it.
 */
function chipLabel(row: PlannedRow, edited: string | undefined): string {
  if (edited !== undefined) return "Edited";

  const prefix = row.sourceRef?.split(".")[0];
  if (prefix === "profile") return "Profile";
  if (prefix === "chat") return "From chat";

  return "Unsourced";
}

export function PreviewRow({ row, checked, edited, onToggle, onEdit, onPoint }: PreviewRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const warningId = useId();

  const value = edited ?? row.value ?? "";
  const label = row.label ?? "This field";
  const chip = chipLabel(row, edited);

  // Focus moves into the input when it opens, and back to the checkbox when it
  // closes. Without this, saving an edit drops focus to the top of the panel.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function open() {
    setDraft(value);
    setEditing(true);
  }

  function close(save: boolean) {
    if (save && draft !== value) onEdit(draft);
    setEditing(false);
    checkboxRef.current?.focus();
  }

  return (
    <li
      // Hover and focus are matched, so the page highlight is reachable without a
      // pointer. `focus`/`blur` rather than `focusin` — React's synthetic versions
      // already bubble from the controls inside.
      onPointerEnter={() => onPoint(row.fieldId)}
      onPointerLeave={() => onPoint()}
      onFocus={() => onPoint(row.fieldId)}
      onBlur={() => onPoint()}
      className="rounded-lg border border-rule bg-surface p-2.5 transition-colors duration-150 hover:border-green-900/30 focus-within:border-green-900/40"
    >
      <div className="flex items-start gap-2.5">
        <span className="relative mt-0.5 flex-none">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
            // The whole row in one name, in the order a screen reader should hear it.
            aria-label={`${label}, ${value === "" ? "empty" : value}, ${row.source ?? chip}`}
            {...(row.suspicious ? { "aria-describedby": warningId } : {})}
            className="size-4.5 appearance-none rounded border border-rule bg-page checked:border-green-900 checked:bg-green-900"
          />
          {checked ? (
            <Check
              size={13}
              className="pointer-events-none absolute left-[3px] top-[3px] text-white"
            />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="min-w-0 flex-1 break-words text-[14px] font-medium leading-[1.35] text-ink">
              {label}
            </span>

            {row.suspicious ? (
              <Warning size={14} className="mt-0.5 flex-none text-state-needs-input" />
            ) : null}
          </div>

          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              aria-label={`Correct the value for ${label}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  close(true);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  close(false);
                }
              }}
              onBlur={() => close(true)}
              className="mt-1.5 w-full rounded-md border border-green-900 bg-page px-2 py-1 font-mono text-[12.5px] text-ink outline-none"
            />
          ) : (
            <div className="mt-1 flex items-start gap-1.5">
              {/*
                Monospaced and `whitespace-pre-wrap`, so a trailing space or a
                lookalike character is something the user can actually see. An empty
                value says so in words rather than rendering as a blank line.
              */}
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12.5px] leading-[1.4] text-ink-muted">
                {value === "" ? <em className="not-italic text-ink-faint">(empty)</em> : value}
              </span>

              <button
                type="button"
                onClick={open}
                aria-label={`Edit the value for ${label}`}
                className="mt-px flex-none rounded p-0.5 text-ink-faint transition-colors duration-150 hover:text-green-900"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-green-50 px-1.5 py-px text-[10.5px] font-medium uppercase tracking-wide text-green-900">
              {chip}
            </span>

            {row.note ? (
              <span className="min-w-0 text-[11.5px] leading-[1.35] text-ink-faint">
                {row.note}
              </span>
            ) : null}
          </div>

          {row.suspicious ? (
            <p id={warningId} className="mt-1.5 text-[11.5px] leading-[1.4] text-state-needs-input">
              This looks like it may not match the field — check it.
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
