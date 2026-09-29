import type { FieldId } from "@/shared/actions";
import type { HighlightState } from "@/shared/overlay";
import { lookup } from "@/content/registry";

/**
 * The overlay: highlight boxes drawn over the portal's own page.
 *
 * It lives in a **closed** shadow root. The portal's CSS cannot reach in, ours
 * cannot leak out, and the portal's own scripts cannot query our nodes. Nothing
 * inside is focusable and nothing inside takes pointer events, so running the
 * Copilot does not change the page's tab order or intercept a single click.
 *
 * The module-level handles below are the one place this repo keeps state in a
 * variable. That rule is about the service worker, which is killed and
 * restarted; a content script's module scope lives and dies with the document it
 * was injected into, and a closed shadow root has to be held somewhere.
 */

/**
 * Re-exported so the modules that draw boxes keep importing the vocabulary from
 * the module that owns the drawing. It is declared in `shared/overlay.ts` because
 * the panel names a state too — a hovered preview row asks the page to point at
 * its field.
 */
export type { HighlightState };

const HOST_ID = "naijagov-copilot-overlay";

let host: HTMLDivElement | undefined;
let shadow: ShadowRoot | undefined;
let boxes: { element: Element; box: HTMLDivElement }[] = [];
let frame: number | undefined;
let tracking = false;

const STYLES = `
  :host {
    /* Declared here rather than inherited: a closed shadow root in someone
       else's page has no design tokens to borrow. */
    --state-needs-input: #B45309;
    --state-filled:      #15803D;
    --state-checkpoint:  #B91C1C;
    --state-explaining:  #1D4ED8;
  }

  .box {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-radius: 6px;
    pointer-events: none;
    color: var(--state-needs-input);
    box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent);
  }

  .box[data-state="needs-input"] { color: var(--state-needs-input); }
  .box[data-state="filled"]      { color: var(--state-filled); }
  .box[data-state="checkpoint"]  { color: var(--state-checkpoint); }
  .box[data-state="explaining"]  { color: var(--state-explaining); }

  /* The only motion in the extension. */
  .box[data-state="needs-input"] { animation: pulse 1.8s ease-in-out infinite; }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent); }
    50%      { box-shadow: 0 0 0 8px color-mix(in srgb, currentColor 8%, transparent); }
  }

  @media (prefers-reduced-motion: reduce) {
    .box[data-state="needs-input"] { animation: none; }
  }
`;

/**
 * Create the overlay root if it is not already there.
 *
 * Safe to call more than once — a portal that swaps out `<body>` will drop our
 * host element, and calling this again puts it back.
 */
export function mountOverlay(): void {
  if (host?.isConnected) return;

  host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("aria-hidden", "true");

  // Set as important, individually: a portal stylesheet with its own `div` rules
  // would otherwise be able to move or reveal our host element.
  const style = host.style;
  style.setProperty("position", "fixed", "important");
  style.setProperty("inset", "0", "important");
  style.setProperty("pointer-events", "none", "important");
  style.setProperty("z-index", "2147483647", "important");
  style.setProperty("border", "none", "important");
  style.setProperty("margin", "0", "important");
  style.setProperty("padding", "0", "important");
  style.setProperty("background", "none", "important");

  shadow = host.attachShadow({ mode: "closed" });

  const sheet = document.createElement("style");
  sheet.textContent = STYLES;
  shadow.append(sheet);

  (document.body ?? document.documentElement).append(host);
}

/**
 * Draw a box over an element.
 *
 * Returns the box so a caller can address it; the boxes are plain `<div>`s with
 * no tabindex and no pointer events, which is what keeps the portal's own
 * keyboard order untouched.
 */
export function highlight(element: Element, state: HighlightState = "needs-input"): HTMLDivElement {
  mountOverlay();

  const existing = boxes.find((entry) => entry.element === element);
  const box = existing?.box ?? document.createElement("div");

  box.className = "box";
  box.dataset.state = state;

  if (!existing) {
    shadow?.append(box);
    boxes.push({ element, box });
  }

  position(element, box);
  startTracking();
  return box;
}

/**
 * Draw a box over a field by its id.
 *
 * The id goes through the registry, which is the only way anything in this
 * extension reaches an element — including the overlay. An id from an earlier
 * generation resolves to nothing and returns `false`, rather than highlighting
 * whatever happens to sit in that position on the page now.
 */
export function highlightField(
  fieldId: FieldId,
  state: HighlightState = "needs-input",
): boolean {
  const element = lookup(fieldId);
  if (!element) return false;

  highlight(element, state);
  return true;
}

/**
 * Draw on a field and bring it into view.
 *
 * "Show me" in the results summary. The scroll is the request, so it happens even
 * when the field is already partly visible — `nearest` keeps a field that is fully
 * on screen from jumping — and it is instant under `prefers-reduced-motion`, where
 * a smooth scroll is exactly the motion that setting exists to refuse.
 *
 * Reading the media query here rather than caching it: the user can change the
 * setting while a page is open, and this runs once per click.
 */
export function revealField(
  fieldId: FieldId,
  state: HighlightState = "needs-input",
): boolean {
  const element = lookup(fieldId);
  if (!element) return false;

  highlight(element, state);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });

  return true;
}

export function clearHighlights(): void {
  for (const { box } of boxes) box.remove();
  boxes = [];
  stopTracking();
}

/** Tear the overlay out of the page entirely. */
export function unmountOverlay(): void {
  clearHighlights();
  host?.remove();
  host = undefined;
  shadow = undefined;
}

function position(element: Element, box: HTMLDivElement): void {
  const rect = element.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;

  box.style.display = visible ? "block" : "none";
  if (!visible) return;

  box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}

/**
 * Boxes follow scroll and resize.
 *
 * One listener pair for the whole overlay, throttled to a frame — a listener per
 * box on a long form is how you make a portal feel broken.
 */
function startTracking(): void {
  if (tracking) return;
  tracking = true;
  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function stopTracking(): void {
  if (!tracking) return;
  tracking = false;
  window.removeEventListener("scroll", schedule, { capture: true });
  window.removeEventListener("resize", schedule);
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = undefined;
}

function schedule(): void {
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    // A box whose element has left the page is dropped, not hidden. The element
    // is gone from the registry too, so there is nothing left for it to be about.
    const surviving: typeof boxes = [];
    for (const entry of boxes) {
      if (entry.element.isConnected) {
        position(entry.element, entry.box);
        surviving.push(entry);
      } else {
        entry.box.remove();
      }
    }
    boxes = surviving;
    if (boxes.length === 0) stopTracking();
  });
}
