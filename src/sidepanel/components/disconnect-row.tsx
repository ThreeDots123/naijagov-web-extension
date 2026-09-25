import { useState } from "react";

/**
 * Disconnect the account.
 *
 * Lives at the bottom of the status strip's expanded detail, under a hairline:
 * it belongs with the other facts about this connection, but it is not a
 * diagnostic, so it reads as a different class of action.
 *
 * Two steps, because it is not undoable from here — a new token has to come off
 * the web app — and a panel this narrow puts a text button close to whatever the
 * user was actually aiming for. The confirm says what it removes rather than
 * asking "are you sure?", which tells nobody anything.
 *
 * Deliberately not red. `--state-checkpoint` means "stop, human required" in
 * this product, and spending it on a log-out would blunt the one signal that
 * has to cut through.
 */

type Phase =
  | { step: "idle" }
  | { step: "confirming" }
  | { step: "working" }
  | { step: "failed" };

export interface DisconnectRowProps {
  /** Rejects if the worker could not finish, so a failure can be shown. */
  onDisconnect: () => Promise<void>;
}

export function DisconnectRow({ onDisconnect }: DisconnectRowProps) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });

  function run() {
    setPhase({ step: "working" });

    void onDisconnect().then(
      // On success the token is gone, `useToken` sees the change and the panel
      // swaps to the connect card — this component unmounts, so there is no
      // success state to render.
      () => undefined,
      () => setPhase({ step: "failed" }),
    );
  }

  if (phase.step === "idle") {
    return (
      <Row>
        <button
          type="button"
          onClick={() => setPhase({ step: "confirming" })}
          className="rounded text-[13px] text-ink-muted hover:text-ink hover:underline"
        >
          Disconnect this account
        </button>
      </Row>
    );
  }

  return (
    <Row>
      <p className="text-[12px] leading-[1.5] text-ink-muted">
        This removes your token and saved details from this browser. You&rsquo;ll need to paste a
        new token to connect again.
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={phase.step === "working"}
          className="h-9 flex-1 rounded-md border border-rule bg-surface text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-page disabled:opacity-60 disabled:hover:bg-surface"
        >
          {phase.step === "working" ? "Disconnecting…" : "Disconnect"}
        </button>

        <button
          type="button"
          onClick={() => setPhase({ step: "idle" })}
          disabled={phase.step === "working"}
          className="h-9 flex-1 rounded-md text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:bg-page disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {phase.step === "failed" ? (
        <p role="status" className="mt-2 text-[12px] text-state-checkpoint">
          Couldn&rsquo;t disconnect. Close the panel and open it again, then try once more.
        </p>
      ) : null}
    </Row>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-rule pt-3">{children}</div>;
}
