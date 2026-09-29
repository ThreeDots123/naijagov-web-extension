import type { PageSnapshot, SerializedField } from "@/shared/page";
import type { RunReport } from "@/shared/results";

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
 *  - **Links are sent inside `buttons`.** Their request models are `extra="forbid"`,
 *    so a `links` key of our own is a 400 on every request until naijagov-api
 *    declares one. Folding is what lets a landing page — all links, no form — reach
 *    the model at all today, and from the model's side the claim is honest enough:
 *    these are the things on the page you can click. Locally they stay a separate
 *    collection, which is what keeps the validator able to refuse a click on one.
 *    When the backend ships a real `links` field, this fold is the thing to delete.
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
const MAX_FIELDS = 300;
/**
 * Their `buttons` and `sensitive_flags` caps are refusals, not truncations.
 *
 * `max_length` on a Pydantic list rejects the whole request. Our own caps are 100
 * buttons and 40 links, which fold into one list that can be 140 long — so the fold
 * has to do the cutting, or a link-heavy page 400s every request made from it.
 */
const MAX_BUTTONS = 100;
const MAX_SENSITIVE_FLAGS = 300;

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
 * The flags that name something we actually sent.
 *
 * Three narrowings, all forced by their schema:
 *
 *  - A page-level flag has no `fieldId` and theirs requires a non-empty one, so
 *    those are dropped. Nothing is lost that matters to them: a page-level blocker
 *    is a CAPTCHA or a payment frame, which raises `CHECKPOINT` here and stops the
 *    turn before a request is made at all.
 *  - A flag naming something the caps cut is dropped too. A flag pointing at an id
 *    that appears nowhere in the body is a dangling reference, and the reader would
 *    have to either ignore it or trust it — neither is a thing to ask of them.
 *  - The list is cut to their cap, which like `buttons` is a refusal rather than a
 *    truncation. Kept in order, so the fields' own flags survive ahead of a
 *    navigation link's.
 */
function toWireFlags(snapshot: PageSnapshot, sent: ReadonlySet<string>): WireSensitiveFlag[] {
  const flags: WireSensitiveFlag[] = [];

  for (const flag of snapshot.sensitiveFlags) {
    if (flags.length >= MAX_SENSITIVE_FLAGS) break;
    if (!flag.fieldId || !sent.has(flag.fieldId)) continue;

    flags.push({ field_id: flag.fieldId, reason: flag.kind });
  }

  return flags;
}

/**
 * Buttons, then links, as one list of clickable things.
 *
 * Buttons first and links after, in each collection's own document order, so the
 * form's own controls are what the model reads before a page's navigation. The ids
 * are ours either way, so an action that comes back naming a link is recognisable
 * as one on this side.
 */
function toWireButtons(snapshot: PageSnapshot): WireButton[] {
  const buttons: WireButton[] = [];

  for (const button of snapshot.buttons) {
    if (buttons.length >= MAX_BUTTONS) break;

    buttons.push({
      field_id: button.fieldId,
      text: clip(button.text, MAX_LABEL),
      sensitive: button.sensitive,
    });
  }

  // Links fill whatever room the form's own controls left. A page with a hundred
  // buttons is a form, and on a form the navigation is the part worth losing.
  //
  // `?? []` for the same reason as `pickBlocker`: a tab that has not reloaded since
  // the extension updated is still running the content script that had no links.
  for (const link of snapshot.links ?? []) {
    if (buttons.length >= MAX_BUTTONS) break;

    buttons.push({
      field_id: link.fieldId,
      text: clip(link.text, MAX_LABEL),
      sensitive: link.sensitive,
    });
  }

  return buttons;
}

function toWireSnapshot(snapshot: PageSnapshot): WireSnapshot {
  const fields = snapshot.fields.slice(0, MAX_FIELDS).map(toWireField);
  const buttons = toWireButtons(snapshot);

  // Only ids that survived the caps above, so no flag dangles.
  const sent = new Set<string>([
    ...fields.map((field) => field.field_id),
    ...buttons.map((button) => button.field_id),
  ]);

  return {
    headings: snapshot.headings.slice(0, MAX_HEADINGS).map((heading) => clip(heading, MAX_HEADING)),
    fields,
    buttons,
    sensitive_flags: toWireFlags(snapshot, sent),
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

/**
 * `POST /results`' body.
 *
 * Four keys per row and none of them can hold what a citizen typed — their
 * `ResultEntry` has a tripwire that refuses a `value` or a `label` key outright, and
 * `ActionResult` has nowhere to put one. The two checks agree, which is the point.
 *
 * Two narrowings are forced by their schema rather than chosen:
 *
 *  - **`field_id` is required there and optional here.** Only a `pause` has no field,
 *    and a pause is a message rather than something that happened to an element, so
 *    those rows are dropped instead of being sent with an invented id.
 *  - **`reason` is required for every status but `ok`.** A row that lost its reason
 *    somewhere would 400 the whole report, so it is sent as `UNKNOWN_FIELD` — the
 *    honest code for "something happened to this and we cannot say what" — rather
 *    than costing the other twenty-nine rows their record.
 */
export interface WireResultEntry {
  action_id: string;
  field_id: string;
  status: string;
  reason?: string;
}

export interface WireResultsRequest {
  session_id: string;
  plan_id: string;
  results: WireResultEntry[];
  checkpoint?: { reason: string; after_index: number };
  aborted?: string;
  elapsed_ms: number;
}

export interface ResultsRequestInput {
  sessionId: string;
  planId: string;
  report: RunReport;
}

export function toResultsRequest(input: ResultsRequestInput): WireResultsRequest {
  const { sessionId, planId, report } = input;

  const results: WireResultEntry[] = [];

  for (const result of report.results) {
    if (result.fieldId === undefined) continue;

    results.push({
      action_id: result.actionId,
      field_id: result.fieldId,
      status: result.status,
      ...(result.status === "ok"
        ? {}
        : { reason: result.reason ?? "UNKNOWN_FIELD" }),
    });
  }

  return {
    session_id: sessionId,
    plan_id: planId,
    results,
    ...(report.checkpoint
      ? {
          checkpoint: {
            reason: report.checkpoint.kind,
            after_index: report.checkpoint.afterIndex,
          },
        }
      : {}),
    ...(report.aborted === undefined ? {} : { aborted: report.aborted }),
    // Their cap is ten minutes and ours is a ten-second batch, so this only guards
    // against a clock that jumped mid-run.
    elapsed_ms: Math.max(0, Math.round(report.elapsedMs)),
  };
}
