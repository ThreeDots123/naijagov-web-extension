import { useEffect, useState } from "react";
import type { FieldId } from "@/shared/actions";
import type { ApprovedRow } from "@/shared/messages";
import { CheckpointBanner } from "@/sidepanel/components/checkpoint/checkpoint-banner";
import { Composer } from "@/sidepanel/components/composer";
import { ConnectCard } from "@/sidepanel/components/connect-card";
import { Transcript } from "@/sidepanel/components/chat/transcript";
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
import {
  approvePlan,
  cancelCheckpoint,
  cancelPlan,
  continueFromCheckpoint,
  highlightField,
  retryAction,
  revealField,
  sendMessage,
  useChat,
} from "@/sidepanel/hooks/use-chat";
import { useConnectionCheck } from "@/sidepanel/hooks/use-connection-check";
import { useCopilotState } from "@/sidepanel/hooks/use-copilot-state";
import { useRunProgress } from "@/sidepanel/hooks/use-run-progress";
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
 * The only stateful component: everything below it takes props and renders. All five
 * hooks live here, which is what keeps `chrome.*` out of the components and makes each
 * of them something you can look at on its own.
 *
 * The transcript is not held here. It lives in `chrome.storage.session` and the panel
 * subscribes to it, so a turn that arrived while the panel was closed is simply there
 * on the next open.
 */

export function App() {
  const token = useToken();
  const live = useCopilotState();
  const { status: backend, check: checkBackend } = useBackendHealth();
  const connectionCheck = useConnectionCheck(checkBackend);
  const chat = useChat(live.tabId);

  const [draft, setDraft] = useState("");
  /** The row whose `Try again` is in flight, so only that button goes inert. */
  const [retrying, setRetrying] = useState<string>();
  /** The re-read a checkpoint's continue triggers. Holds the banner's checking state. */
  const [resuming, setResuming] = useState(false);

  // Development only. `SCENARIOS.live` is the real thing, and the production build
  // drops this along with the switcher itself.
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

  const thinking = state === "PLANNING";
  const executing = state === "EXECUTING";
  // `EXECUTING` keeps the composer shut too: the approved actions are running and the
  // user should not be able to start a second turn on top of them.
  const busy = thinking || executing;

  const progress = useRunProgress(executing);

  // A dev scenario fakes the state it displays and must not be able to drive a real
  // checkpoint's buttons, so the banner reads from the live session either way.
  const checkpoint = override ? undefined : live.checkpoint;

  // Nothing should be left pointing at a field once the panel goes away.
  useEffect(() => () => highlightField(), []);

  async function submit() {
    const text = draft.trim();
    if (text.length === 0 || busy) return;

    setDraft("");
    await sendMessage(text);
  }

  async function resend(text: string) {
    if (busy) return;
    await sendMessage(text);
  }

  function pickPrompt(prompt: string) {
    setDraft(prompt);
    void sendMessage(prompt);
  }

  function approve(turnId: string, rows: readonly ApprovedRow[]) {
    highlightField();
    void approvePlan(turnId, rows);
  }

  function cancel(turnId: string) {
    highlightField();
    void cancelPlan(turnId);
  }

  /** A missing-data chip loads its question into the composer; the user answers it. */
  function ask(question: string) {
    setDraft(question);
  }

  function point(fieldId?: FieldId) {
    highlightField(fieldId);
  }

  /** `Show me`: draw on the field and bring the page to it. */
  function show(fieldId: FieldId) {
    revealField(fieldId);
  }

  async function retry(turnId: string, actionId: string) {
    if (retrying !== undefined) return;

    setRetrying(actionId);
    try {
      await retryAction(turnId, actionId);
    } finally {
      setRetrying(undefined);
    }
  }

  /**
   * `I've done it — continue`.
   *
   * Always a fresh read, never a resume. Whatever the read finds — a clear page, the
   * same step still unfinished, a page that has moved on — is written to the session
   * by the worker, so the banner below simply re-renders from it.
   */
  async function resume() {
    if (resuming) return;

    setResuming(true);
    try {
      await continueFromCheckpoint();
    } finally {
      setResuming(false);
    }
  }

  async function abandon() {
    await cancelCheckpoint();
  }

  const started = chat.turns.length > 0;

  return (
    <div className="flex h-dvh flex-col bg-page text-ink">
      <PanelHeader />

      <StatusStrip
        status={status}
        rawState={state}
        url={override ? undefined : live.url}
        backend={backend}
        check={connectionCheck}
        // Hidden without a token, and inert under a dev scenario — the switcher fakes
        // what the panel displays and must not be able to wipe a real one.
        onDisconnect={connected && !override ? disconnect : undefined}
      />

      <main data-scroller className="min-h-0 flex-1 overflow-y-auto p-4">
        {token.status === "loading" && !override ? null : connected ? (
          <>
            {/*
              The greeting and the prompts are the empty state. Once a conversation
              starts they are gone rather than scrolled past — a "quick prompts" panel
              above a live thread is a dead end the user has already moved beyond.
            */}
            {started ? (
              <Transcript
                turns={chat.turns}
                thinking={thinking}
                onApprove={approve}
                onCancel={cancel}
                onAsk={ask}
                onRetry={(text) => void resend(text)}
                onPoint={point}
                onShow={show}
                onRetryAction={(turnId, actionId) => void retry(turnId, actionId)}
                {...(retrying === undefined ? {} : { retrying })}
                {...(progress === undefined ? {} : { progress })}
              />
            ) : (
              <>
                <GreetingBubble supported={supported} stopped={stopped} />
                <QuickPrompts disabled={stopped || busy} onPick={pickPrompt} />
              </>
            )}
          </>
        ) : (
          <ConnectCard
            onOpenProfile={openProfile}
            onConnect={(value) => void storeToken(value)}
          />
        )}
      </main>

      {/*
        Arriving replies announce here, once.

        A second polite region alongside the status strip's, deliberately: that one
        announces the *state* in words and would otherwise flip between "Thinking" and
        a paragraph of prose. Only the reply is announced — never the card, which a
        screen reader reaches as a labelled group in its own right.
      */}
      <p aria-live="polite" className="sr-only">
        {lastReply(chat.turns)}
      </p>

      {/*
        Pinned above the composer, which stays live beneath it. A user stopped at a
        one-time code is exactly the user who wants to ask what the code is for, and a
        panel that goes silent at that moment is a panel that abandons them at the
        hardest step. Quick prompts go, because none of them can help here.
      */}
      {checkpoint ? (
        <CheckpointBanner
          checkpoint={checkpoint}
          checking={resuming}
          onContinue={() => void resume()}
          onCancel={() => void abandon()}
        />
      ) : null}

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void submit()}
        disabled={!connected || busy}
        placeholder={
          !connected
            ? "Connect your account to start"
            : executing
              ? "One moment — filling the form…"
              : stopped
                ? "Ask me anything about this step…"
                : "Type your message…"
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

/**
 * The newest Copilot reply, for the live region.
 *
 * Only the last one, and only when it is the last turn: announcing an older reply
 * again because a system note arrived after it would read as the assistant repeating
 * itself.
 */
function lastReply(turns: readonly { role: string; text: string }[]): string {
  const last = turns[turns.length - 1];

  return last?.role === "copilot" ? last.text : "";
}
