import type { FieldId } from "@/shared/actions";

/**
 * The serialized page.
 *
 * The important property is negative: **no type in this file has a slot for a
 * field's current value.** What the user has already typed into a portal page
 * does not leave the browser, and the way to guarantee that is to leave nowhere
 * for it to go. Labels and structure travel. Contents do not.
 *
 * naijagov-api mirrors this file, the same way it mirrors `actions.ts`: this is
 * the body of `POST /context`. Adding a field here is a two-repo change.
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
