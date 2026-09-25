import { useId, useState } from "react";
import type { CopilotState } from "@/shared/state";
import { ChevronDown } from "@/sidepanel/components/icons";
import { StatusDetail } from "@/sidepanel/components/status-detail";
import { StatusDot } from "@/sidepanel/components/ui/status-dot";
import type { BackendStatus } from "@/sidepanel/hooks/use-backend-health";
import type { ConnectionCheck } from "@/sidepanel/hooks/use-connection-check";
import type { StatusDescription } from "@/sidepanel/lib/status";

/**
 * One strip, not four cards.
 *
 * Status is a glance: a dot and a few words while things are fine, and more only
 * when the user asks or something is wrong. A 320px-wide panel spends its height
 * on the actual work, so the detail lives behind a disclosure — see
 * `status-detail.tsx`.
 */

export interface StatusStripProps {
  /** Already resolved by the panel, because "no token" is not a machine state. */
  status: StatusDescription;
  rawState: CopilotState;
  url: string | undefined;
  backend: BackendStatus;
  check: ConnectionCheck;
  /** Absent when there is no token — there is nothing to disconnect from. */
  onDisconnect?: () => Promise<void>;
}

export function StatusStrip({
  status,
  rawState,
  url,
  backend,
  check,
  onDisconnect,
}: StatusStripProps) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();

  const stopped = status.tone === "stop";

  return (
    <section className="flex-none">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={detailId}
        className={`flex h-[34px] w-full items-center gap-2 border-b border-rule px-4 text-left ${
          // CHECKPOINT is the one state that changes more than the dot, because
          // it is the one state that stops everything.
          stopped ? "bg-state-checkpoint/10" : "bg-page"
        }`}
      >
        <StatusDot tone={status.tone} busy={status.busy} />

        {/*
          The panel's one live region. It announces the state in words — never
          the colour, and never the enum — and nothing else in the panel
          announces on its own.
        */}
        <span
          aria-live="polite"
          data-busy={status.busy}
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-muted"
        >
          {status.label}
        </span>

        {/*
          Quiet by default. A healthy system shouldn't spend pixels telling you
          it is healthy, so this appears only when the backend is not fine.
        */}
        {backend === "offline" ? (
          <span className="flex-none rounded bg-state-needs-input/10 px-1.5 py-0.5 text-[11px] font-medium text-state-needs-input">
            Backend offline
          </span>
        ) : null}

        <ChevronDown
          size={12}
          className={`flex-none text-ink-faint transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/*
        Expands in place and pushes the body down — no overlay. The 0fr → 1fr
        grid row is what makes a 150ms transition possible without knowing the
        content's height, and `inert` keeps the collapsed detail out of the tab
        order and the accessibility tree while it stays in the DOM for that
        transition.
      */}
      <div
        className={`grid transition-[grid-template-rows] duration-150 ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div id={detailId} inert={!expanded} className="overflow-hidden">
          <StatusDetail
            status={status}
            rawState={rawState}
            url={url}
            backend={backend}
            check={check}
            onDisconnect={onDisconnect}
          />
        </div>
      </div>
    </section>
  );
}
