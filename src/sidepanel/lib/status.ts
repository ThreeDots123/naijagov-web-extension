import type { CopilotState } from "@/shared/state";

/**
 * What the user is told about the state machine.
 *
 * One place, so the strip, the expanded detail and any later surface cannot
 * disagree about what `AWAITING_CONFIRMATION` means in English. The enum is a
 * developer's word; the label is the user's.
 *
 * A tone is a role, not a colour — `styles.css` maps each to one of the
 * overlay's fixed state colours. Nothing here knows a hex.
 */

export type StatusTone = "neutral" | "working" | "ok" | "info" | "stop";

export interface StatusDescription {
  tone: StatusTone;
  /** Plain English. Never the raw state — colour and jargon both need a translation. */
  label: string;
  /** Something is in flight: the dot pulses, or takes an ellipsis under reduced motion. */
  busy: boolean;
}

/**
 * No token stored.
 *
 * Kept apart from `describeState` because it is not a state of the machine — the
 * machine sits at `IDLE` either way. What differs is that the user has nothing
 * connected yet, which is a fact about the account, not about the page.
 */
export const NOT_CONNECTED: StatusDescription = {
  tone: "neutral",
  label: "Not connected",
  busy: false,
};

/**
 * The state, as the user should read it.
 *
 * `supported` splits `READY` in two: ready on a portal we know, and honestly
 * unable on a page we don't. The panel never claims to be ready when it isn't.
 */
export function describeState(state: CopilotState, supported: boolean): StatusDescription {
  switch (state) {
    case "IDLE":
      return { tone: "neutral", label: "Not active on this page", busy: false };

    case "READING":
      return { tone: "working", label: "Reading this page", busy: true };

    case "READY":
      return supported
        ? { tone: "ok", label: "Ready on this page", busy: false }
        : { tone: "neutral", label: "This page isn't supported", busy: false };

    case "PLANNING":
      return { tone: "working", label: "Thinking", busy: true };

    case "AWAITING_CONFIRMATION":
      return { tone: "info", label: "Waiting for your approval", busy: false };

    case "EXECUTING":
      return { tone: "working", label: "Filling the form", busy: true };

    case "CHECKPOINT":
      return { tone: "stop", label: "Your turn — human action needed", busy: false };
  }
}
