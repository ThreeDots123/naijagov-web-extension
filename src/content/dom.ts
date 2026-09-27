/**
 * DOM reading primitives shared by the serializer, the labeller and the detector.
 *
 * Everything here is a read. Nothing in this file writes to the page, which is
 * what lets the serializer do all of its reading before it stamps a single
 * attribute — one layout pass instead of one per field.
 */

/** Collapse whitespace and trim. The only cleaning that happens to every string. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function elementText(element: Element): string {
  return cleanText(element.textContent ?? "");
}

export interface WalkResult {
  /** Every element under `root`, including those in open shadow roots. */
  elements: Element[];
  /**
   * Custom elements that look like they are hiding a closed shadow root.
   *
   * A closed root cannot be traversed and its existence cannot be detected
   * directly, so this is a heuristic: a custom element (its tag name has a dash)
   * with no open root and no children of its own almost certainly renders
   * something we cannot see. It sets the snapshot's `ambiguous` flag rather than
   * being guessed at.
   */
  unreadable: number;
}

/**
 * One pass over the tree, descending into open shadow roots.
 *
 * A `TreeWalker` does not cross a shadow boundary, so each root gets its own and
 * the roots are worked through as a stack.
 */
export function walkElements(root: Document | Element | ShadowRoot): WalkResult {
  const elements: Element[] = [];
  const pending: (Document | Element | ShadowRoot)[] = [root];
  let unreadable = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    const document = ownerDocumentOf(current);
    const walker = document.createTreeWalker(current, NodeFilter.SHOW_ELEMENT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const element = node as Element;
      elements.push(element);

      if (element.shadowRoot) pending.push(element.shadowRoot);
      else if (looksLikeClosedShadowHost(element)) unreadable += 1;
    }
  }

  return { elements, unreadable };
}

/**
 * Is this element actually on screen for the user?
 *
 * Off-screen but scrollable-to counts as visible — most of a long government form
 * is below the fold, and a serializer that only saw the first viewport would miss
 * most of the page.
 */
export function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  if (element.closest("[aria-hidden='true']")) return false;
  if (element instanceof HTMLElement && element.hidden) return false;

  const style = getComputedStyle(element);
  if (style.display === "none") return false;
  if (style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (style.opacity === "0") return false;

  // `display: none` on an ancestor leaves an element with no boxes at all, which
  // is the only way to catch it from here. Guarded by whether the document has
  // been laid out: before first layout nothing has a rect, and treating that as
  // "nothing is visible" would serialize an empty page.
  if (hasLayout(element) && element.getClientRects().length === 0) return false;

  return true;
}

/**
 * The accessible name, for elements whose own text is empty.
 *
 * Not a full accname implementation — the three sources that actually appear on
 * portal buttons, in the order the spec resolves them.
 */
export function accessibleName(element: Element): string {
  const fromIds = textFromIdList(element, element.getAttribute("aria-labelledby"));
  if (fromIds) return fromIds;

  const label = cleanText(element.getAttribute("aria-label") ?? "");
  if (label) return label;

  return cleanText(element.getAttribute("title") ?? "");
}

/** Join the text of the elements an `aria-labelledby` points at. */
export function textFromIdList(element: Element, idList: string | null): string {
  if (!idList) return "";

  const scope = element.getRootNode();
  if (!isIdScope(scope)) return "";

  const parts: string[] = [];
  for (const id of idList.split(/\s+/)) {
    if (!id) continue;
    const target = scope.getElementById(id);
    if (target) parts.push(elementText(target));
  }

  return cleanText(parts.join(" "));
}

/** Origin and path of a URL. Never its query string, which can carry a value. */
export function urlWithoutQuery(url: string, base?: string): string {
  try {
    const parsed = new URL(url, base);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function isIdScope(node: Node): node is Document | ShadowRoot {
  return node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}

function ownerDocumentOf(node: Document | Element | ShadowRoot): Document {
  return node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : (node.ownerDocument ?? document);
}

function looksLikeClosedShadowHost(element: Element): boolean {
  return element.tagName.includes("-") && element.children.length === 0;
}

function hasLayout(element: Element): boolean {
  const root = element.ownerDocument?.documentElement;
  return root !== undefined && root !== null && root.getClientRects().length > 0;
}
