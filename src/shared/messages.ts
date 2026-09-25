import type { Action, ActionResult, FieldId } from "@/shared/actions";
import type { PageSnapshot } from "@/shared/page";
import type { CopilotState, HealthState } from "@/shared/state";

/**
 * Every message that crosses between the side panel, the service worker and the
 * content script. One discriminated union, one send helper, no ad-hoc objects.
 *
 * In this task only PING/PONG, HEALTH_CHECK/HEALTH_RESULT and STATE_CHANGED
 * have bodies. The rest are declared and answered with `notImplemented`, so the
 * task that builds them adds a function body rather than inventing a contract.
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
  | DisconnectedMessage;

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
  PONG: void;
  DISCONNECTED: void;
  PAGE_SNAPSHOT: void;
  ACTION_RESULTS: void;
  CHECKPOINT_DETECTED: void;
  STATE_CHANGED: void;
  HEALTH_RESULT: void;
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
