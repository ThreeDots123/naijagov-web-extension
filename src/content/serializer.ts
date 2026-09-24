import type { FieldId } from "@/shared/actions";
import type { PageSnapshot } from "@/shared/page";

/**
 * DOM → structured page JSON.
 *
 * Not implemented yet. The signature is the contract: a pure function over a DOM
 * node, returning a snapshot and the id registry that goes with it. No
 * messaging, no storage, no fetch — that is what makes it testable.
 *
 * Two rules it must hold to when it is built:
 *
 *  - It stamps `data-copilot-id` on every element it extracts and returns the
 *    registry mapping those ids back to elements. This registry is the *only*
 *    way an action ever reaches an element. The model never supplies a selector,
 *    and an unknown id is never "resolved" with a querySelector fallback.
 *  - It serializes labels and structure. It does not read what the user has
 *    already typed. `SerializedField` has no slot for a value, on purpose.
 */

/** The attribute the serializer stamps. Nothing else in the repo writes it. */
export const FIELD_ID_ATTRIBUTE = "data-copilot-id";

/** Id → element, for exactly the elements this read extracted. */
export type FieldRegistry = ReadonlyMap<FieldId, Element>;

export interface SerializeResult {
  snapshot: PageSnapshot;
  registry: FieldRegistry;
}

export function serializePage(root: Document | Element = document): SerializeResult {
  throw new Error("serializePage is not implemented yet.");
}

/**
 * Compute the structural hash for a page.
 *
 * Structure only — field contents never feed the hash, or every keystroke would
 * look like a new page.
 */
export function hashPage(snapshot: Omit<PageSnapshot, "pageHash">): string {
  throw new Error("hashPage is not implemented yet.");
}
