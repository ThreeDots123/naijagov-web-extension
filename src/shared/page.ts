import type { FieldId } from "@/shared/actions";

/**
 * The serialized page.
 *
 * The important property is negative: **no type in this file has a slot for a
 * field's current value.** What the user has already typed into a portal page
 * does not leave the browser, and the way to guarantee that is to leave nowhere
 * for it to go. Labels and structure travel. Contents do not.
 *
 * naijagov-api mirrors the *shape* of this file, but not key for key: both of its
 * request models are `extra="forbid"`, and `sw/payload.ts` narrows a snapshot down
 * to the keys they declare before anything is sent. So this type is richer than the
 * wire, deliberately — a field added here is local until `payload.ts` chooses to
 * send it, and sending a key they have not declared is a 400 rather than a key they
 * ignore. Widening what actually crosses is the two-repo change.
 */

/** Why the detector stopped on something. */
export type SensitiveKind =
  | "password"
  | "otp"
  | "captcha"
  | "payment"
  | "submit"
  | "upload"
  | "unknown";

/**
 * The kinds that stop the whole page rather than one field.
 *
 * A password field is a field the Copilot will not write to; the rest of the form
 * is still ordinary work. A CAPTCHA or a payment frame is different — the page is
 * gated by a third party, and there is nothing useful to do on it but hand back
 * to the user. Only these raise the `CHECKPOINT` state.
 */
export const BLOCKING_SENSITIVE_KINDS = ["captcha", "payment"] as const satisfies readonly SensitiveKind[];

export function isBlockingKind(kind: SensitiveKind): boolean {
  return (BLOCKING_SENSITIVE_KINDS as readonly SensitiveKind[]).includes(kind);
}

/**
 * What the user is told, per kind. Says what they must do, never how to get around it.
 *
 * Here rather than beside the detector's rules because both the content script and
 * the service worker print these — a run that stops at a payment frame is raised as
 * a checkpoint by the worker, and the worker may not import from `content/`.
 */
export const SENSITIVE_REASONS: Record<SensitiveKind, string> = {
  password: "This is a password field. Type it yourself — I never handle passwords.",
  otp: "This needs the one-time code sent to you. Enter it yourself — I never handle codes.",
  captcha: "This step checks you're a person. Only you can complete it.",
  payment: "This is a payment step. I don't touch payments — please continue yourself.",
  submit: "This button submits your application. Review everything, then submit it yourself.",
  upload: "Choosing a file from your device is something only you can do.",
  unknown: "The Copilot won't touch this one.",
};

/** The sentence shown when the page is gated but nothing on it could be named. */
export const UNNAMED_BLOCKER_REASON = "This page needs you to take over.";

export interface SensitiveFlag {
  /** The element this is about. Absent when the flag is about the page as a whole. */
  fieldId?: FieldId;
  kind: SensitiveKind;
  /** Plain English, shown to the user. Says what they must do, never how to skip it. */
  reason: string;
}

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "search"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea"
  | "file"
  | "password"
  | "other";

/**
 * How a field's label was found, in the order the resolver tries them.
 *
 * Recorded because when a step match fails on the backend the first question is
 * always "what label did we send, and where did we get it?", and a snapshot that
 * cannot answer that turns a five-minute fix into an afternoon.
 */
export type LabelMethod =
  | "aria-labelledby"
  | "aria-label"
  | "label-for"
  | "label-ancestor"
  | "legend"
  | "nearby-text"
  | "placeholder"
  | "title"
  | "name"
  | "none";

export interface SerializedOption {
  label: string;
  value: string;
}

export interface SerializedField {
  /** The serializer's id, stamped onto the element as `data-copilot-id`. */
  fieldId: FieldId;
  type: FieldType;
  /** The visible label, cleaned for reading. Empty when we could not find one. */
  label: string;
  /** The label before trimming and stripping — the backend normalises differently. */
  rawLabel: string;
  /** Which rule in the ordered list produced `label`. */
  labelMethod: LabelMethod;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  /** The element's `maxlength`, when it sets one. */
  maxLength?: number;
  /** Present for `select` and radio groups. The validator checks fills against these. */
  options?: SerializedOption[];
  /** True when the real option list was longer than the cap and was cut. */
  optionsTruncated?: boolean;
  /** Helper text shown next to the field on the page, if any. */
  hint?: string;
  /** The detector's verdict. Nothing may be written to a field that carries `true`. */
  sensitive: boolean;
}

export interface SerializedButton {
  fieldId: FieldId;
  text: string;
  /** The detector's verdict. Only a cleared button can be the target of `clickSafe`. */
  sensitive: boolean;
}

/**
 * A link on the page.
 *
 * Portals are navigated, not only filled. A landing page has no form at all — its
 * "Renew Licence" is an `<a href>`, and before this existed the serializer walked
 * such a page and emitted nothing but headings, so the only honest thing the model
 * could say about it was that there was nothing to interact with. Someone asking
 * "where do I start?" got told to go and find the button themselves.
 *
 * Links are **read, never driven**. The validator clears `clickSafe` only for
 * something `isButtonLike` accepts, and a navigation link is not, so a planned click
 * on one is refused. Following a link navigates the tab, and that stays the user's
 * decision — exactly like the Continue button. These exist so the Copilot can say
 * where to go, not so it can go there.
 */
export interface SerializedLink {
  fieldId: FieldId;
  /** The visible text, or the accessible name when it has none. */
  text: string;
  /**
   * Origin and path of the href, never its query string — the same rule as
   * `PageSnapshot.url`, and for the same reason: a `method="get"` form puts what
   * the user typed into the next URL.
   *
   * Empty for a link we cannot resolve or would not follow: a bare `#`, a
   * `javascript:` handler, a `mailto:`. The *text* is what makes those useful, and
   * an href we cannot describe is better absent than guessed at.
   */
  href: string;
  /** True when it leaves this page's own origin. */
  external: boolean;
  sensitive: boolean;
}

/**
 * A frame on the page.
 *
 * A cross-origin frame cannot be read at all, so it is described by where it
 * points and nothing else. That is enough to recognise a CAPTCHA or a payment
 * provider, which is the only reason we look.
 */
export interface SerializedFrame {
  fieldId: FieldId;
  /** Origin and path of the frame's `src`. Never its query string. */
  src: string;
  crossOrigin: boolean;
  sensitive: boolean;
}

/** What the detector concluded about the page as a whole. */
export interface CheckpointSummary {
  /** Anything at all was flagged. The panel can say what it will not touch. */
  present: boolean;
  /** A page-level blocker — CAPTCHA or payment. This is what raises `CHECKPOINT`. */
  blocking: boolean;
  /** The distinct reasons found, so the panel can pick its wording. */
  kinds: SensitiveKind[];
}

/** What the walk saw, including the things it deliberately did not emit. */
export interface SnapshotCounts {
  fields: number;
  buttons: number;
  /** `contenteditable` regions, out of scope for the MVP but worth knowing about. */
  contentEditable: number;
}

export interface PageSnapshot {
  /**
   * Origin and path only.
   *
   * The query string is cut before this leaves the content script, and that is a
   * safety rule rather than tidiness: a form submitted with `method="get"` puts
   * everything the user typed into the next page's URL. Sending the full href
   * would leak field values through the one field that looks innocent.
   */
  url: string;
  title: string;
  /**
   * A stable hash of the page's structure — not its contents.
   *
   * The worker re-reads the page only when this changes, which is what keeps us
   * from posting the same page to the backend on every scroll and re-render.
   * Computed by `shared/page-hash.ts`, whose algorithm the backend mirrors.
   */
  pageHash: string;
  /**
   * Which read produced this snapshot, counting from 1.
   *
   * Every `fieldId` carries it, so an action planned against an older view of the
   * page is recognisably stale rather than silently applied to a different
   * element. Deliberately outside the hash: re-reading an unchanged page must not
   * look like a change.
   */
  generation: number;
  headings: string[];
  fields: SerializedField[];
  buttons: SerializedButton[];
  links: SerializedLink[];
  frames: SerializedFrame[];
  sensitiveFlags: SensitiveFlag[];
  checkpoint: CheckpointSummary;
  counts: SnapshotCounts;
  /** True when the field or button cap was hit and the tail was dropped. */
  truncated: boolean;
  /**
   * True when the serializer could not confidently read the page — unlabelled
   * fields, a closed shadow root it could not enter. The panel asks rather than
   * guesses.
   */
  ambiguous: boolean;
}

/**
 * Which flagged thing the checkpoint should name.
 *
 * A gated page usually carries several flags at once — replica step 2 has a file
 * upload, a one-time-code field and a "Pay and submit" button — and the banner
 * names exactly one. Two orderings decide which, and both are about what the user
 * has to *do* next rather than about what the detector found first.
 *
 * **Role first.** A CAPTCHA or payment frame is the gate itself and outranks
 * everything: it is a third party holding the page, and nothing else on it matters
 * until it is satisfied. Then fields, because a field is the step — something to
 * read a code into, something to type. Then buttons, which are what the user
 * presses *after* the step, not the step. Then links, which only take you
 * somewhere else and so are never what a page is waiting on. A page-level flag
 * naming no element is last, since it can only produce a sentence and no highlight.
 *
 * **Then kind**, in the order below, so a page with both an OTP field and a
 * password field names the one the page is actually waiting on.
 *
 * Document order is never the tiebreak. The upload field on step 2 comes first in
 * the DOM and is the least useful thing to point at.
 */
const BLOCKER_KIND_ORDER: readonly SensitiveKind[] = [
  "captcha",
  "payment",
  "otp",
  "password",
  "submit",
  "upload",
  "unknown",
];

type BlockerRole = "frame" | "field" | "button" | "link" | "page";

const BLOCKER_ROLE_ORDER: readonly BlockerRole[] = [
  "frame",
  "field",
  "button",
  "link",
  "page",
];

function rankIn<T>(order: readonly T[], value: T): number {
  const index = order.indexOf(value);

  // An unlisted value sorts last rather than first. A kind added to `SensitiveKind`
  // and forgotten here must not silently outrank a payment frame.
  return index === -1 ? order.length : index;
}

export function pickBlocker(snapshot: PageSnapshot): SensitiveFlag | undefined {
  const roles = new Map<FieldId, BlockerRole>();
  for (const frame of snapshot.frames) roles.set(frame.fieldId, "frame");
  for (const field of snapshot.fields) roles.set(field.fieldId, "field");
  for (const button of snapshot.buttons) roles.set(button.fieldId, "button");
  // `?? []` because a snapshot can arrive from an *older* content script: Chrome
  // leaves the previously injected script running on already-open tabs until they
  // reload, so for one update's worth of tabs the worker is newer than its eyes.
  for (const link of snapshot.links ?? []) roles.set(link.fieldId, "link");

  const roleOf = (flag: SensitiveFlag): BlockerRole =>
    (flag.fieldId === undefined ? undefined : roles.get(flag.fieldId)) ?? "page";

  let best: SensitiveFlag | undefined;
  let bestRank: [number, number] | undefined;

  for (const flag of snapshot.sensitiveFlags) {
    const rank: [number, number] = [
      rankIn(BLOCKER_ROLE_ORDER, roleOf(flag)),
      rankIn(BLOCKER_KIND_ORDER, flag.kind),
    ];

    if (bestRank && !(rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1]))) {
      continue;
    }

    best = flag;
    bestRank = rank;
  }

  return best;
}
