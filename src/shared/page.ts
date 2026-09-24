import type { FieldId } from "@/shared/actions";

/**
 * The serialized page.
 *
 * Filled in by the serializer task; the shape is fixed here so everything
 * downstream has something real to compile against.
 *
 * The important property is negative: **no type in this file has a slot for a
 * field's current value.** What the user has already typed into a portal page
 * does not leave the browser, and the way to guarantee that is to leave nowhere
 * for it to go. Labels and structure travel. Contents do not.
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
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea"
  | "file"
  | "password"
  | "other";

export interface SerializedOption {
  label: string;
  value: string;
}

export interface SerializedField {
  /** The serializer's id, stamped onto the element as `data-copilot-id`. */
  fieldId: FieldId;
  type: FieldType;
  /** The visible label, or our best reading of one. Empty when we could not find one. */
  label: string;
  required: boolean;
  /** Present for `select` and radio groups. The validator checks fills against these. */
  options?: SerializedOption[];
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

export interface PageSnapshot {
  url: string;
  title: string;
  /**
   * A stable hash of the page's structure — not its contents.
   *
   * The worker re-reads the page only when this changes, which is what keeps us
   * from posting the same page to the backend on every scroll and re-render.
   */
  pageHash: string;
  headings: string[];
  fields: SerializedField[];
  buttons: SerializedButton[];
  sensitiveFlags: SensitiveFlag[];
  /**
   * True when the serializer could not confidently read the page — unlabelled
   * fields, a layout it could not follow. The panel asks rather than guesses.
   */
  ambiguous: boolean;
}
