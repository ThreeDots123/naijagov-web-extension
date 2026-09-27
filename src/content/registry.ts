import type { FieldId } from "@/shared/actions";

/**
 * The id registry.
 *
 * This is the single mechanism by which an action ever reaches an element. The
 * model never supplies a selector — there is nowhere in the action schema to put
 * one — and an id that is not in the current registry is **rejected**, never
 * resolved with a `querySelector` fallback. That removes selector hallucination
 * as a category of bug rather than mitigating it.
 *
 * Ids carry the generation they were minted in (`g4-f12`). Re-reading the page
 * increments it, so a plan built against generation 3 cannot fill a field in
 * generation 4: the page changed, and re-planning is the correct answer.
 *
 * Module-level state is deliberate and safe here. The rule against it is about the
 * service worker, which MV3 stops and restarts; a content script's module scope
 * lives and dies with the document it was injected into, which is exactly the
 * lifetime a registry should have.
 */

/** The attribute the serializer stamps. Nothing else in the repo writes it. */
export const FIELD_ID_ATTRIBUTE = "data-copilot-id";

/** Id → element, for exactly the elements one read extracted. */
export type FieldRegistry = ReadonlyMap<FieldId, Element>;

const ID_PATTERN = /^g(\d+)-f(\d+)$/;

let generation = 0;
let counter = 0;
/**
 * Weak on purpose: a portal that re-renders a long form drops hundreds of nodes,
 * and a registry holding them strongly would keep every one of them alive for as
 * long as the tab is open.
 */
let entries = new Map<FieldId, WeakRef<Element>>();

/** Begin a new read. Increments the generation and empties the registry. */
export function startGeneration(): number {
  generation += 1;
  counter = 0;
  entries = new Map();
  return generation;
}

export function currentGeneration(): number {
  return generation;
}

/**
 * Mint an id for an element and stamp it on.
 *
 * This attribute is the only mutation the Copilot makes to a page outside an
 * approved fill. It changes no layout, takes no focus, and matches nothing a
 * portal's own stylesheet or script would be looking for.
 */
export function register(element: Element): FieldId {
  counter += 1;
  const id = `g${generation}-f${counter}`;
  element.setAttribute(FIELD_ID_ATTRIBUTE, id);
  entries.set(id, new WeakRef(element));
  return id;
}

/**
 * Resolve an id to the element it was minted for.
 *
 * Returns nothing for an id from an earlier generation, an id that was never
 * minted, an element that has been garbage collected, and an element that has
 * been detached from the document. Every one of those is a rejection, and the
 * validator reports it rather than trying another way to find the element.
 */
export function lookup(id: FieldId): Element | undefined {
  if (generationOf(id) !== generation) return undefined;

  const element = entries.get(id)?.deref();
  return element?.isConnected ? element : undefined;
}

/** The generation an id belongs to, or `undefined` if it is not one of ours. */
export function generationOf(id: FieldId): number | undefined {
  const match = ID_PATTERN.exec(id);
  const found = match?.[1];
  return found === undefined ? undefined : Number(found);
}

/**
 * A strong map of everything still resolvable, for one batch of work.
 *
 * The validator needs the elements themselves, and holding them strongly for the
 * length of one action batch is fine — the weak references above are about the
 * registry that outlives it.
 */
export function materialise(): FieldRegistry {
  const map = new Map<FieldId, Element>();

  for (const [id, reference] of entries) {
    const element = reference.deref();
    if (element?.isConnected) map.set(id, element);
  }

  return map;
}

/**
 * Remove our attribute from elements that this read did not collect.
 *
 * Without this, a field that disappears from the page keeps a stamp from an old
 * generation, and `inspectElement` would go on reporting flags against an id
 * nothing can resolve.
 */
export function clearStaleStamps(root: Document | Element = document): void {
  for (const element of root.querySelectorAll(`[${FIELD_ID_ATTRIBUTE}]`)) {
    const id = element.getAttribute(FIELD_ID_ATTRIBUTE);
    if (id !== null && !entries.has(id)) element.removeAttribute(FIELD_ID_ATTRIBUTE);
  }
}

/** Drop everything. For `pagehide`, and for keeping tests independent. */
export function resetRegistry(): void {
  generation = 0;
  counter = 0;
  entries = new Map();
}
