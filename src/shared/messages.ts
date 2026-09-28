import type { Action, ActionResult, FieldId } from "@/shared/actions";
import type { HighlightState } from "@/shared/overlay";
import type { PageSnapshot } from "@/shared/page";
import type { CopilotState, HealthState } from "@/shared/state";

/**
 * Every message that crosses between the side panel, the service worker and the
 * content script. One discriminated union, one send helper, no ad-hoc objects.
 *
 * EXECUTE_ACTIONS and ACTION_RESULTS are still declared and answered with
 * `notImplemented`: the executor is the next fragment, and its contract already
 * exists here so that task adds a function body rather than inventing one.
 */

/** panel → sw → content. "Is anyone home on this page?" */
export interface PingMessage {
  type: "PING";
}

/** content → sw → panel. The answer to PING. Carries no page contents. */
export interface PongMessage {
  type: "PONG";
  url: string;
  elementCount: number;
}

/** sw → content. Read the page. */
export interface SerializePageMessage {
  type: "SERIALIZE_PAGE";
}

/** content → sw. Structure and labels only — never a field's contents. */
export interface PageSnapshotMessage {
  type: "PAGE_SNAPSHOT";
  snapshot: PageSnapshot;
}

/** sw → content. Run these, one at a time, each re-validated before it runs. */
export interface ExecuteActionsMessage {
  type: "EXECUTE_ACTIONS";
  actions: Action[];
}

/** content → sw. Ids and statuses. No values. */
export interface ActionResultsMessage {
  type: "ACTION_RESULTS";
  results: ActionResult[];
}

/** content → sw → panel. The detector fired. Everything pending is cancelled. */
export interface CheckpointDetectedMessage {
  type: "CHECKPOINT_DETECTED";
  reason: string;
  fieldId?: FieldId;
}

/** sw → panel. Broadcast on every state write. */
export interface StateChangedMessage {
  type: "STATE_CHANGED";
  state: CopilotState;
}

/**
 * panel → sw. Is the backend up?
 *
 * The panel cannot ask the backend itself — the service worker is the only
 * context that touches the network — so it asks through here.
 */
export interface HealthCheckMessage {
  type: "HEALTH_CHECK";
}

/** sw → panel. The answer to HEALTH_CHECK. */
export interface HealthResultMessage {
  type: "HEALTH_RESULT";
  health: HealthState;
}

/**
 * panel → sw. Forget this account.
 *
 * Handled by the worker rather than the panel because the worker owns
 * `chrome.storage.session`, and a disconnect has to take the per-tab state with
 * it: a pending action can carry a value derived from the profile, and that must
 * not survive the account it came from.
 */
export interface DisconnectMessage {
  type: "DISCONNECT";
}

/** sw → panel. The answer to DISCONNECT. Nothing left to report but success. */
export interface DisconnectedMessage {
  type: "DISCONNECTED";
}

/**
 * panel → sw. Plan a turn for this page and this message.
 *
 * Answered only when the turn is finished, which can be twenty seconds: a pending
 * response is what keeps the service worker alive across the model call. The
 * outcome is *also* written to the tab's transcript before this resolves, so a
 * panel that was closed mid-turn finds the answer waiting rather than losing it.
 */
export interface PlanRequestMessage {
  type: "PLAN_REQUEST";
  message: string;
}

/**
 * sw → panel. The turn is over — read the transcript.
 *
 * Deliberately carries no plan. There is one source of truth for what was said,
 * and it is `chrome.storage.session`; a copy travelling back here could disagree
 * with it, and the panel would have no way to know which was newer.
 */
export interface PlanReadyMessage {
  type: "PLAN_READY";
}

/**
 * One row as the user left it.
 *
 * `value` is present only when they corrected it. A corrected value is the user's
 * own — it dispatches with a `ValueSource` of `{ kind: "user" }`, whatever the
 * backend originally sourced it from — which is what keeps the rule that no value
 * is filled unless it traces to the profile or to something the user typed.
 */
export interface ApprovedRow {
  actionId: string;
  value?: string;
}

/**
 * panel → sw. The user pressed `Fill selected` on this turn's preview.
 *
 * The chosen rows travel with the approval rather than being read back from
 * storage. The card on screen is the thing the user agreed to, so it is the thing
 * that is sent; a stored selection would be a second source of truth about a
 * decision that has already been made.
 */
export interface PlanApproveMessage {
  type: "PLAN_APPROVE";
  turnId: string;
  rows: ApprovedRow[];
}

/**
 * sw → panel. What approval did.
 *
 * `stale` means the page hash moved while the preview was open: the plan was
 * discarded and the page re-read, and nothing was dispatched. The user is asked to
 * send their message again rather than being silently re-planned — they may want
 * to say something different now.
 */
export interface PlanApprovedMessage {
  type: "PLAN_APPROVED";
  outcome: "dispatched" | "stale";
  /** How many actions were handed off. Zero on `stale`. */
  dispatched: number;
}

/** panel → sw. The user pressed `Cancel`. Nothing has touched the page. */
export interface PlanCancelMessage {
  type: "PLAN_CANCEL";
  turnId: string;
}

export interface PlanCancelledMessage {
  type: "PLAN_CANCELLED";
}

/**
 * panel → sw → content. Point at a field on the page, or stop pointing.
 *
 * One message for both directions of a hover: with a `fieldId` it draws, without
 * one it clears. Two messages would be two chances for a stray clear to arrive
 * after the next draw.
 */
export interface FieldHighlightMessage {
  type: "FIELD_HIGHLIGHT";
  /** Absent means "clear everything". */
  fieldId?: FieldId;
  state?: HighlightState;
}

/**
 * content → panel. Whether a box was actually drawn.
 *
 * False for a clear, and false for an id from an earlier generation — a stale id
 * resolves to nothing rather than highlighting whatever now sits in that position.
 */
export interface FieldHighlightedMessage {
  type: "FIELD_HIGHLIGHTED";
  drawn: boolean;
}

/**
 * sw → content. What is this page's structural hash right now?
 *
 * Asked at approval, not at planning. Cheaper than a full snapshot round trip and
 * it answers the only question approval has: is this still the page the plan was
 * built against?
 */
export interface PageHashCheckMessage {
  type: "PAGE_HASH_CHECK";
}

/** content → sw. The hash as of this instant, and the read that produced it. */
export interface PageHashMessage {
  type: "PAGE_HASH";
  pageHash: string;
  generation: number;
}

export type Message =
  | PingMessage
  | PongMessage
  | SerializePageMessage
  | PageSnapshotMessage
  | ExecuteActionsMessage
  | ActionResultsMessage
  | CheckpointDetectedMessage
  | StateChangedMessage
  | HealthCheckMessage
  | HealthResultMessage
  | DisconnectMessage
  | DisconnectedMessage
  | PlanRequestMessage
  | PlanReadyMessage
  | PlanApproveMessage
  | PlanApprovedMessage
  | PlanCancelMessage
  | PlanCancelledMessage
  | FieldHighlightMessage
  | FieldHighlightedMessage
  | PageHashCheckMessage
  | PageHashMessage;

export type MessageType = Message["type"];

export const MESSAGE_TYPES = [
  "PING",
  "PONG",
  "SERIALIZE_PAGE",
  "PAGE_SNAPSHOT",
  "EXECUTE_ACTIONS",
  "ACTION_RESULTS",
  "CHECKPOINT_DETECTED",
  "STATE_CHANGED",
  "HEALTH_CHECK",
  "HEALTH_RESULT",
  "DISCONNECT",
  "DISCONNECTED",
  "PLAN_REQUEST",
  "PLAN_READY",
  "PLAN_APPROVE",
  "PLAN_APPROVED",
  "PLAN_CANCEL",
  "PLAN_CANCELLED",
  "FIELD_HIGHLIGHT",
  "FIELD_HIGHLIGHTED",
  "PAGE_HASH_CHECK",
  "PAGE_HASH",
] as const satisfies readonly MessageType[];

type Expect<T extends true> = T;

/** Fails the build if a message is added to the union but not to the list above. */
export type MessageTypeCoverage = Expect<
  Exclude<MessageType, (typeof MESSAGE_TYPES)[number]> extends never ? true : false
>;

/**
 * What each message is answered with.
 *
 * `void` means the message is a notification — it is the answer to something
 * else, or nobody replies to it.
 */
export interface ResponseFor {
  PING: PongMessage;
  SERIALIZE_PAGE: PageSnapshotMessage;
  EXECUTE_ACTIONS: ActionResultsMessage;
  HEALTH_CHECK: HealthResultMessage;
  DISCONNECT: DisconnectedMessage;
  PLAN_REQUEST: PlanReadyMessage;
  PLAN_APPROVE: PlanApprovedMessage;
  PLAN_CANCEL: PlanCancelledMessage;
  FIELD_HIGHLIGHT: FieldHighlightedMessage;
  PAGE_HASH_CHECK: PageHashMessage;
  PONG: void;
  DISCONNECTED: void;
  PAGE_SNAPSHOT: void;
  ACTION_RESULTS: void;
  CHECKPOINT_DETECTED: void;
  STATE_CHANGED: void;
  HEALTH_RESULT: void;
  PLAN_READY: void;
  PLAN_APPROVED: void;
  PLAN_CANCELLED: void;
  FIELD_HIGHLIGHTED: void;
  PAGE_HASH: void;
}

export type Response<M extends Message> = ResponseFor[M["type"]];

/**
 * A failure that crossed a context boundary.
 *
 * `chrome.runtime.sendMessage` cannot carry an Error, so handlers answer with
 * this instead and the helpers below turn it back into a thrown error.
 */
export interface MessageError {
  ok: false;
  error: string;
}

export function isMessageError(value: unknown): value is MessageError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

export function messageError(error: unknown): MessageError {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function isMessage(value: unknown): value is Message {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && (MESSAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Send to the service worker (or, from the worker, to every extension context).
 *
 * Typed both ways: a wrong payload is a compile error, and the resolved value is
 * the response that belongs to that message.
 */
export async function sendToRuntime<M extends Message>(message: M): Promise<Response<M>> {
  return unwrap(await chrome.runtime.sendMessage(message));
}

/** Send to a tab's content script. */
export async function sendToTab<M extends Message>(
  tabId: number,
  message: M,
): Promise<Response<M>> {
  return unwrap(await chrome.tabs.sendMessage(tabId, message));
}

/**
 * Broadcast to whatever extension pages are open, and shrug if none are.
 *
 * The side panel is usually closed. "Could not establish connection" is the
 * normal case for a broadcast, not an error worth surfacing.
 */
export async function broadcast(message: Message): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // No listener. Nothing to do.
  }
}

function unwrap<T>(response: unknown): T {
  if (isMessageError(response)) throw new Error(response.error);
  return response as T;
}

/**
 * The stand-in for a message that is declared but not yet built.
 *
 * It throws rather than returning a plausible empty value, so a half-wired flow
 * fails loudly in development instead of quietly doing nothing in a demo.
 */
export function notImplemented(type: MessageType): never {
  throw new Error(`${type} is declared but not implemented yet.`);
}

/**
 * Exhaustiveness check.
 *
 * Every switch over the message union ends in this, so adding a message type
 * fails the build until someone handles it.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
