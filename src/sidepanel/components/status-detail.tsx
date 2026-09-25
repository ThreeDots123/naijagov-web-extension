import type { ReactNode } from "react";
import type { CopilotState } from "@/shared/state";
import { DisconnectRow } from "@/sidepanel/components/disconnect-row";
import { StatusDot } from "@/sidepanel/components/ui/status-dot";
import type { BackendStatus } from "@/sidepanel/hooks/use-backend-health";
import type { ConnectionCheck, ConnectionResult } from "@/sidepanel/hooks/use-connection-check";
import type { StatusDescription, StatusTone } from "@/sidepanel/lib/status";

/**
 * What the status strip shows once it is expanded.
 *
 * Everything here is the answer to "why isn't it working?" — which page we think
 * we're on, the raw state for a support conversation, and whether the backend is
 * answering. None of it earns space until someone asks.
 */

export interface StatusDetailProps {
  status: StatusDescription;
  rawState: CopilotState;
  url: string | undefined;
  backend: BackendStatus;
  check: ConnectionCheck;
  /** Absent when there is no token — there is nothing to disconnect from. */
  onDisconnect?: () => Promise<void>;
}

export function StatusDetail({
  status,
  rawState,
  url,
  backend,
  check,
  onDisconnect,
}: StatusDetailProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-rule bg-surface p-4">
      <DetailRow label="Page">
        <span dir="ltr" className="block truncate">
          {describePage(url)}
        </span>
      </DetailRow>

      <DetailRow label="Status">
        {/* The enum is here and only here: support needs it, the user doesn't. */}
        <span className="block truncate">
          {status.label} <span className="text-ink-faint">{rawState}</span>
        </span>
      </DetailRow>

      <DetailRow label="Backend">
        <span className="flex items-center gap-1.5">
          <StatusDot tone={backendTone(backend)} size={6} />
          {describeBackend(backend)}
        </span>
      </DetailRow>

      <div>
        <button
          type="button"
          onClick={check.run}
          disabled={!check.canRun}
          className="h-9 w-full rounded-md border border-rule bg-surface text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-page disabled:opacity-60 disabled:hover:bg-surface"
        >
          {check.running ? "Checking…" : "Check connection"}
        </button>

        {/*
          A result the user asked for, so it is announced. Unlike the state
          label above, this changes only on a click and cannot chatter.
        */}
        <p role="status" className={`mt-2 text-[12px] ${resultTone(check.result)}`}>
          {describeResult(check.result)}
        </p>
      </div>

      {onDisconnect ? <DisconnectRow onDisconnect={onDisconnect} /> : null}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-faint">{label}</div>
      <div className="min-w-0 text-[13px] text-ink">{children}</div>
    </div>
  );
}

/** Host and path, without the scheme — the scheme is noise in a 320px column. */
function describePage(url: string | undefined): string {
  if (!url) return "No active page";

  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    return url;
  }
}

function describeBackend(backend: BackendStatus): string {
  switch (backend) {
    case "checking":
      return "Checking…";
    case "online":
      return "Connected";
    case "offline":
      return "Offline";
  }
}

function backendTone(backend: BackendStatus): StatusTone {
  switch (backend) {
    case "checking":
      return "neutral";
    case "online":
      return "ok";
    case "offline":
      return "working";
  }
}

function describeResult(result: ConnectionResult): string {
  switch (result.kind) {
    case "none":
      return "Checks that the Copilot can reach this page, and that the service is up.";
    case "ok":
      return `Reached this page · ${result.elementCount.toLocaleString()} elements · ${result.ago}`;
    case "page-unreachable":
      return "Couldn't reach this page. Reload it and try again.";
    case "backend-down":
      return "Backend didn't respond.";
  }
}

function resultTone(result: ConnectionResult): string {
  switch (result.kind) {
    case "none":
      return "text-ink-faint";
    case "ok":
      return "text-ink-muted";
    case "page-unreachable":
    case "backend-down":
      return "text-state-checkpoint";
  }
}
