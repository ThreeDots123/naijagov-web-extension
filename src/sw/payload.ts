import type { PageSnapshot, SerializedField } from "@/shared/page";

/**
 * Our snapshot, as the backend's request bodies.
 *
 * `PageSnapshot` is richer than either endpoint accepts, and both of naijagov-api's
 * request models are `extra="forbid"` — a key they do not declare is a 400, not a
 * key they ignore. So this narrows rather than spreads, and every property below is
 * one their schema names. Spreading the snapshot would be shorter and would fail on
 * the first request.
 *
 * Two mappings are not obvious and both are deliberate:
 *
 *  - **`options` are sent as option *values*, not labels.** The guard matches a
 *    select's value "in the option's own spelling" and hands back the string it
 *    matched, which is then what gets written to the element. A `<select>` is set by
 *    its option's `value`, so sending labels would return a string that selects
 *    nothing. `collect.ts` already falls back to the option's text where there is no
 *    `value` attribute, so nothing is lost on a portal that omits them.
 *  - **`sensitive_flags[].reason` carries our `kind`, not our sentence.** Their field
 *    is documented as a short category — "password", "otp" — and it is read as one.
 *    Our human-readable reason is for the panel and stays in the browser.
 *
 * Nothing here can carry a field's contents: `SerializedField` has no slot for one,
 * which is the property `shared/page.ts` exists to guarantee. Their `PageField` has
 * a tripwire that refuses a `value` key outright, and the two checks agree.
 */

/** Their caps, from `src/context/constants.py`. Exceeding one is a 400. */
const MAX_LABEL = 200;
const MAX_HEADING = 300;
const MAX_TITLE = 300;
const MAX_URL = 2048;
const MAX_HEADINGS = 20;
const MAX_OPTIONS = 200;

export interface WireField {
  field_id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  sensitive: boolean;
}

export interface WireButton {
  field_id: string;
  text: string;
  sensitive: boolean;
}

export interface WireSensitiveFlag {
  field_id: string;
  reason: string;
}

/** The parts of a snapshot both endpoints take, in their spelling. */
interface WireSnapshot {
  headings: string[];
  fields: WireField[];
  buttons: WireButton[];
  sensitive_flags: WireSensitiveFlag[];
}

export interface WireContextRequest extends WireSnapshot {
  tab_id: number;
  url: string;
  title: string;
  page_hash: string;
  ambiguous: boolean;
}

export interface WirePlanRequest extends WireSnapshot {
  session_id: string;
  url: string;
  page_hash: string;
  message: string;
  client_plan_id?: string;
}

/** Their `Label` type caps at 200 characters and strips whitespace. We do both here. */
function clip(text: string, limit: number): string {
  return text.trim().slice(0, limit);
}

function toWireField(field: SerializedField): WireField {
  return {
    field_id: field.fieldId,
    label: clip(field.label, MAX_LABEL),
    type: field.type,
    // Their cap is 200 and our serializer's is 40, so this only ever guards against
    // the two drifting apart.
    options: (field.options ?? []).slice(0, MAX_OPTIONS).map((option) => clip(option.value, MAX_LABEL)),
    required: field.required,
    sensitive: field.sensitive,
  };
}

/**
 * The flags that name a field.
 *
 * A page-level flag has no `fieldId` and their schema requires a non-empty one, so
 * those are dropped. Nothing is lost that matters to them: a page-level blocker is a
 * CAPTCHA or a payment frame, which raises `CHECKPOINT` here and stops the turn
 * before a request is made at all.
 */
function toWireFlags(snapshot: PageSnapshot): WireSensitiveFlag[] {
  const flags: WireSensitiveFlag[] = [];

  for (const flag of snapshot.sensitiveFlags) {
    if (!flag.fieldId) continue;
    flags.push({ field_id: flag.fieldId, reason: flag.kind });
  }

  return flags;
}

function toWireSnapshot(snapshot: PageSnapshot): WireSnapshot {
  return {
    headings: snapshot.headings.slice(0, MAX_HEADINGS).map((heading) => clip(heading, MAX_HEADING)),
    fields: snapshot.fields.map(toWireField),
    buttons: snapshot.buttons.map((button) => ({
      field_id: button.fieldId,
      text: clip(button.text, MAX_LABEL),
      sensitive: button.sensitive,
    })),
    sensitive_flags: toWireFlags(snapshot),
  };
}

/**
 * `POST /context`'s body.
 *
 * `page_hash` is ours and they say so: theirs is authoritative and this is compared
 * against it, never trusted. We send it anyway because a mismatch is information
 * they log.
 */
export function toContextRequest(snapshot: PageSnapshot, tabId: number): WireContextRequest {
  return {
    tab_id: tabId,
    url: clip(snapshot.url, MAX_URL),
    title: clip(snapshot.title, MAX_TITLE),
    page_hash: snapshot.pageHash,
    ambiguous: snapshot.ambiguous,
    ...toWireSnapshot(snapshot),
  };
}

export interface PlanRequestInput {
  snapshot: PageSnapshot;
  sessionId: string;
  /** The server's hash, adopted from `/context`. Not ours. */
  serverPageHash: string;
  message: string;
  clientPlanId?: string;
}

/**
 * `POST /plan`'s body.
 *
 * Note what is *absent*: no `tab_id`, no `title`, no `ambiguous`. Their `PlanRequest`
 * does not declare them and forbids extras, so including them — which reusing the
 * context body would do — is a 400 on every plan.
 *
 * The snapshot is re-sent rather than looked up from the session, because the guard
 * checks every action against what is on screen *now*. A page that changed since
 * `/context` is the case `/plan` exists to refuse.
 */
export function toPlanRequest(input: PlanRequestInput): WirePlanRequest {
  const { snapshot, sessionId, serverPageHash, message, clientPlanId } = input;

  return {
    session_id: sessionId,
    url: clip(snapshot.url, MAX_URL),
    page_hash: serverPageHash,
    message,
    ...(clientPlanId === undefined ? {} : { client_plan_id: clientPlanId }),
    ...toWireSnapshot(snapshot),
  };
}
