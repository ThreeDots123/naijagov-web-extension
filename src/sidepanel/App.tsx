import { useState } from "react";
import { Composer } from "@/sidepanel/components/composer";
import { ConnectCard } from "@/sidepanel/components/connect-card";
import type { ScenarioKey } from "@/sidepanel/components/dev/state-switcher";
import {
  SCENARIOS,
  StateSwitcher,
} from "@/sidepanel/components/dev/state-switcher";
import { GreetingBubble } from "@/sidepanel/components/greeting-bubble";
import { PanelHeader } from "@/sidepanel/components/panel-header";
import { QuickPrompts } from "@/sidepanel/components/quick-prompts";
import { StatusStrip } from "@/sidepanel/components/status-strip";
import { useBackendHealth } from "@/sidepanel/hooks/use-backend-health";
import { useConnectionCheck } from "@/sidepanel/hooks/use-connection-check";
import { useCopilotState } from "@/sidepanel/hooks/use-copilot-state";
import {
  disconnect,
  openProfile,
  storeToken,
  useToken,
} from "@/sidepanel/hooks/use-token";
import { describeState, NOT_CONNECTED } from "@/sidepanel/lib/status";

/**
 * The panel.
 *
 * The only stateful component: everything below it takes props and renders. All
 * four hooks live here, which is what keeps `chrome.*` out of the components and
 * makes each of them something you can look at in isolation.
 *
 * Nothing here talks to the AI. The quick prompts and the composer fill the
 * field and call a handler that does nothing yet — the transcript is its own task.
 */

export function App() {
  const token = useToken();
  const live = useCopilotState();
  const { status: backend, check: checkBackend } = useBackendHealth();
  const connectionCheck = useConnectionCheck(checkBackend);

  const [draft, setDraft] = useState("");

  // Development only. `SCENARIOS.live` is the real thing, and the production
  // build drops this along with the switcher itself.
  const [scenario, setScenario] = useState<ScenarioKey>("live");
  const override =
    import.meta.env.DEV && scenario !== "live"
      ? SCENARIOS[scenario]
      : undefined;

  const connected = override
    ? override.connected
    : token.status === "ready" && token.value !== undefined;
  const state = override?.state ?? live.state;
  const supported = override?.supported ?? live.supported;

  const status = connected ? describeState(state, supported) : NOT_CONNECTED;
  const stopped = state === "CHECKPOINT";

  function submit() {
    // Wired in the chat task. Left deliberately inert rather than stubbed with a
    // fake reply, so nothing in the panel can look like it works before it does.
  }

  function pickPrompt(prompt: string) {
    setDraft(prompt);
    submit();
  }

  return (
    <div className="flex h-dvh flex-col bg-page text-ink">
      <PanelHeader />

      <StatusStrip
        status={status}
        rawState={state}
        url={override ? undefined : live.url}
        backend={backend}
        check={connectionCheck}
        // Hidden without a token, and inert under a dev scenario — the switcher
        // fakes what the panel displays and must not be able to wipe a real one.
        onDisconnect={connected && !override ? disconnect : undefined}
      />

      <main className="min-h-0 flex-1 overflow-y-auto p-4">

        {token.status === "loading" && !override ? null : connected ? (
          <>
            <GreetingBubble supported={supported} />
            <QuickPrompts disabled={stopped} onPick={pickPrompt} />
          </>
        ) : (
          <ConnectCard
            onOpenProfile={openProfile}
            onConnect={(value) => void storeToken(value)}
          />
        )}
      </main>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        disabled={!connected}
        placeholder={
          connected ? "Type your message…" : "Connect your account to start"
        }
      />

      {import.meta.env.DEV ? (
        <StateSwitcher value={scenario} onChange={setScenario} />
      ) : null}

      <footer className="flex h-7 flex-none items-center justify-center px-4 text-[11px] text-ink-faint">
        Not affiliated with any government agency.
      </footer>
    </div>
  );
}
