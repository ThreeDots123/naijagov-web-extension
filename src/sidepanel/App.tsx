import { useState } from "react";
import { sendToRuntime } from "@/shared/messages";
import { ConnectPlaceholder } from "@/sidepanel/connect/ConnectPlaceholder";
import { useActiveTab, useBackendHealth, useCopilotState, useToken } from "@/sidepanel/hooks";

/**
 * The panel shell.
 *
 * For this task the body is a readout: what state the Copilot is in, what tab it
 * is looking at, whether the content script answers, and whether the backend is
 * up. Everything that will eventually live here — chat, the fill preview, the
 * checkpoint banner — hangs off the same three pieces of plumbing.
 */

type PingResult =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok"; url: string; elementCount: number }
  | { status: "error"; message: string };

export function App() {
  const token = useToken();
  const tab = useActiveTab();
  const state = useCopilotState(tab?.id);
  const { health, refresh } = useBackendHealth();
  const [ping, setPing] = useState<PingResult>({ status: "idle" });

  async function onPing() {
    setPing({ status: "pending" });
    refresh();

    try {
      const pong = await sendToRuntime({ type: "PING" });
      setPing({ status: "ok", url: pong.url, elementCount: pong.elementCount });
    } catch (error) {
      setPing({
        status: "error",
        message: error instanceof Error ? error.message : "The page didn't answer.",
      });
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-page text-ink">
      <Header />

      <main className="flex-1 space-y-3 px-4 py-4">
        {token.status === "ready" && token.value === undefined ? <ConnectPlaceholder /> : null}

        <Row label="Status" value={state} />
        <Row label="Page" value={tab?.url ?? "No tab"} wrap />
        <Row label="Backend" value={describeHealth(health)} />

        <section className="rounded-lg border border-rule bg-surface p-4">
          <button
            type="button"
            onClick={() => void onPing()}
            disabled={ping.status === "pending"}
            className="w-full rounded-md bg-green-900 px-3 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {ping.status === "pending" ? "Pinging…" : "Ping page"}
          </button>

          <p className="mt-3 wrap-break-word text-ink-muted" aria-live="polite">
            {describePing(ping)}
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center gap-2 border-b border-rule bg-surface px-4 py-3">
      {/* The same mark as the toolbar icon, generated from public/icons/logo.svg. */}
      <img src="/icons/icon-48.png" alt="" width={24} height={24} className="size-6 shrink-0" />
      <h1 className="truncate text-base font-semibold text-ink">NaijaGov Copilot</h1>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-rule px-4 py-3 text-ink-faint">
      Not affiliated with any government agency.
    </footer>
  );
}

interface RowProps {
  label: string;
  value: string;
  /** Long values — a URL — wrap instead of pushing the panel sideways. */
  wrap?: boolean;
}

function Row({ label, value, wrap = false }: RowProps) {
  return (
    <div className="rounded-lg border border-rule bg-surface px-4 py-3">
      <div className="text-ink-faint">{label}</div>
      <div className={`mt-0.5 font-medium text-ink ${wrap ? "break-all" : "truncate"}`}>{value}</div>
    </div>
  );
}

function describeHealth(health: { reachable: boolean } | undefined): string {
  if (!health) return "Checking…";
  return health.reachable ? "Online" : "Offline";
}

function describePing(ping: PingResult): string {
  switch (ping.status) {
    case "idle":
      return "Ping the page to check the Copilot can reach it.";
    case "pending":
      return "Waiting for the page…";
    case "ok":
      return `${ping.url} — ${ping.elementCount.toLocaleString()} elements`;
    case "error":
      return ping.message;
  }
}
