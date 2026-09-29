import { useId, useState } from "react";
import type { FieldId } from "@/shared/actions";
import type { Plan } from "@/shared/plan";
import type { ActionResult, RunOutcome } from "@/shared/results";
import { ChevronDown } from "@/sidepanel/components/icons";
import { ResultRow } from "@/sidepanel/components/preview/result-row";
import {
  DEFAULT_NEXT_HINT,
  abortNote,
  summaryHeader,
} from "@/sidepanel/lib/results-copy";

/**
 * What the run actually did.
 *
 * Honest before encouraging, and the layout is the argument: **failures open,
 * successes collapsed.** A summary that leads with "Filled 8 of 9!" and hides the
 * ninth behind a disclosure costs more trust than the failure did, so the group that
 * needs the user is first and already expanded, and the eight that worked are one
 * line until someone asks.
 *
 * A value the page rewrote gets its own group rather than being counted as a success.
 * The fill worked; the portal then changed it, and the user is the only one who can
 * say whether what it changed it to is right.
 *
 * Labels come from the plan attached to the same turn. They are not in the results
 * and never travel: `ActionResult` is the shape that goes to the backend and it has
 * nowhere to put a label, so the only copy is the one already in this browser.
 */

export interface RunSummaryProps {
  outcome: RunOutcome;
  /** The plan this run came from — where the field labels are. */
  plan: Plan;
  /** The action id currently being retried, if any. */
  retrying?: string;
  onShow: (fieldId: FieldId) => void;
  onRetry: (actionId: string) => void;
}

export function RunSummary({ outcome, plan, retrying, onShow, onRetry }: RunSummaryProps) {
  const headingId = useId();
  const { report } = outcome;

  const labels = new Map(
    plan.actions.map((row) => [row.actionId, row.label] as const),
  );

  const needsUser = report.results.filter(
    (result) => result.status === "failed" || result.status === "rejected",
  );
  const changed = report.results.filter((result) => result.status === "changed");
  const filled = report.results.filter((result) => result.status === "ok");
  const cancelled = report.results.filter((result) => result.status === "cancelled");

  const row = (result: ActionResult) => (
    <ResultRow
      key={result.actionId}
      result={result}
      {...(labels.get(result.actionId) === undefined
        ? {}
        : { label: labels.get(result.actionId) })}
      retrying={retrying === result.actionId}
      onShow={onShow}
      onRetry={onRetry}
    />
  );

  return (
    <section
      role="group"
      aria-labelledby={headingId}
      className="mt-2.5 rounded-[10px] border border-rule bg-page p-3"
    >
      {/*
        The header announces politely and once. The card itself is reachable as a
        labelled group, so a screen reader is not read the whole thing on arrival.
      */}
      <h3
        id={headingId}
        aria-live="polite"
        className="text-[13.5px] font-semibold text-ink"
      >
        {summaryHeader(report.totals)}
      </h3>

      {report.aborted ? (
        <p className="mt-1 text-[12.5px] leading-[1.4] text-ink-muted">
          {abortNote(report.aborted)}
        </p>
      ) : null}

      <Group title="Needs you" count={needsUser.length} open>
        {needsUser.map(row)}
      </Group>

      <Group title="Changed by the page" count={changed.length} open>
        {changed.map(row)}
      </Group>

      <Group
        title="Filled"
        count={filled.length}
        summary={`${filled.length} ${filled.length === 1 ? "field" : "fields"} filled`}
      >
        {filled.map(row)}
      </Group>

      <Group title="Cancelled" count={cancelled.length}>
        {cancelled.map(row)}
      </Group>

      <p className="mt-3 border-t border-rule pt-2.5 text-[12.5px] leading-[1.45] text-ink-muted">
        {outcome.hint ?? DEFAULT_NEXT_HINT}
      </p>
    </section>
  );
}

interface GroupProps {
  title: string;
  count: number;
  /** Open from the start. The groups that need the user are; the rest are not. */
  open?: boolean;
  /** The one-line form shown while collapsed. Defaults to the title and a count. */
  summary?: string;
  children: React.ReactNode;
}

/**
 * One group of rows.
 *
 * An open group is a heading and a list. A collapsed one is a disclosure button
 * carrying its own `aria-expanded`, so the control and the heading are the same
 * element rather than a heading with an unlabelled chevron next to it.
 */
function Group({ title, count, open = false, summary, children }: GroupProps) {
  const [expanded, setExpanded] = useState(open);
  const listId = useId();

  if (count === 0) return null;

  if (open) {
    return (
      <div className="mt-2.5">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-faint">
          {title}
        </h4>
        <ul className="mt-1.5 flex flex-col gap-1.5">{children}</ul>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <h4>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="flex w-full items-center gap-1.5 rounded text-left text-[12.5px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
        >
          <ChevronDown
            size={11}
            className={`flex-none text-ink-faint transition-transform duration-150 ${
              expanded ? "rotate-180" : "-rotate-90"
            }`}
          />
          {summary ?? `${title} — ${count}`}
        </button>
      </h4>

      {expanded ? (
        <ul id={listId} className="mt-1.5 flex flex-col gap-1.5">
          {children}
        </ul>
      ) : null}
    </div>
  );
}
