import type { Action, ValueSource } from "@/shared/actions";
import type { ApprovedRow } from "@/shared/messages";
import type { Plan, PlannedRow } from "@/shared/plan";

/**
 * A plan plus the user's choices, as actions the content script can run.
 *
 * Pure. No storage, no messaging, no clock — a function of the plan and what the
 * user ticked, which is what makes the one rule it enforces checkable:
 *
 *   **No value that does not trace to the profile, to the conversation, or to
 *   something the user typed into the preview itself.**
 *
 * The backend's guard already drops an unsourced write, so a row arriving here
 * without provenance means the two repos have drifted. It is dropped again, with a
 * reason, rather than filled on the assumption that somebody else checked.
 */

/**
 * `profile.email` → `{ kind: "profile", key: "email" }`.
 *
 * The backend's `source_ref` is the only machine-readable provenance in the
 * response; its `source` is an English sentence for the panel to print. Reading the
 * sentence to reconstruct a `ValueSource` would be absurd, so this reads the ref.
 */
function toValueSource(sourceRef: string | undefined): ValueSource | undefined {
  if (sourceRef === undefined) return undefined;

  const [prefix, ...rest] = sourceRef.split(".");
  const key = rest.join(".");

  if (prefix === "profile" && key.length > 0) return { kind: "profile", key };
  if (prefix === "chat") return { kind: "chat" };

  // An unrecognised prefix is not coerced into one of the three. A value whose
  // origin we cannot name is a value we do not fill.
  return undefined;
}

export interface DroppedRow {
  actionId: string;
  reason: string;
}

export interface BuiltActions {
  actions: Action[];
  /** Reported, never silently discarded. */
  dropped: DroppedRow[];
}

/**
 * One row as an action, or the reason it cannot be one.
 *
 * `edited` is the value the user typed into the preview. It wins over the backend's,
 * and it changes the provenance to `user` — correcting a value makes it the user's
 * own, whatever it started as.
 */
function toAction(row: PlannedRow, edited: string | undefined): Action | string {
  const fieldId = row.fieldId;
  const actionId = row.actionId;

  switch (row.type) {
    case "fill":
    case "select": {
      if (!fieldId) return "the plan gave no field for it";

      const value = edited ?? row.value;
      if (value === undefined) return "the plan carried no value for it";

      const source: ValueSource | undefined =
        edited === undefined ? toValueSource(row.sourceRef) : { kind: "user" };

      if (!source) return "we couldn't tell where that value came from";

      return { actionId, type: row.type, fieldId, value, source };
    }

    case "check": {
      if (!fieldId) return "the plan gave no field for it";
      if (row.checked === undefined) return "the plan didn't say to tick or untick it";

      const source = toValueSource(row.sourceRef) ?? { kind: "user" as const };

      return { actionId, type: "check", fieldId, checked: row.checked, source };
    }

    case "highlight":
    case "scroll":
    case "explain":
    case "clickSafe": {
      if (!fieldId) return "the plan gave no field for it";

      return { actionId, type: row.type, fieldId };
    }

    case "pause":
      return { actionId, type: "pause", reason: row.reason ?? "This one needs you." };
  }
}

/**
 * The plan's rows the user approved, in the plan's own order.
 *
 * Order is the plan's and not the selection's: an earlier fill can change what a
 * later field contains, and the backend planned them in a sequence.
 */
export function buildActions(plan: Plan, rows: readonly ApprovedRow[]): BuiltActions {
  const chosen = new Map(rows.map((row) => [row.actionId, row]));

  const actions: Action[] = [];
  const dropped: DroppedRow[] = [];

  for (const row of plan.actions) {
    const choice = chosen.get(row.actionId);
    if (!choice) continue;

    const built = toAction(row, choice.value);

    if (typeof built === "string") {
      dropped.push({ actionId: row.actionId, reason: built });
      continue;
    }

    actions.push(built);
  }

  return { actions, dropped };
}

/**
 * Whether a row is one the preview offers a checkbox for.
 *
 * Only the actions that change something are the user's to approve. A `highlight` or
 * a `scroll` touches nothing, and a `pause` is a message rather than a step, so none
 * of them belongs in a list headed "I can fill 5 of 6 fields".
 */
export function isFillableRow(row: PlannedRow): boolean {
  return row.type === "fill" || row.type === "select" || row.type === "check";
}
