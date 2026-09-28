/**
 * The overlay's four states.
 *
 * They live in `shared/` rather than in `content/overlay.ts` because the panel now
 * names one: hovering a preview row asks the page to point at that field, and a
 * message cannot carry a type only the content script can see.
 *
 * The four carry meaning and are fixed. `content/overlay.ts` owns what each one
 * looks like; this owns only the vocabulary.
 */
export const HIGHLIGHT_STATES = [
  /** The user must fill this. Amber, and the only thing in the extension that moves. */
  "needs-input",
  /** Filled by the Copilot and confirmed by read-back. Green. */
  "filled",
  /** Stop — a human is required. Red. */
  "checkpoint",
  /** Currently being pointed at or explained. Blue. */
  "explaining",
] as const;

export type HighlightState = (typeof HIGHLIGHT_STATES)[number];

export function isHighlightState(value: unknown): value is HighlightState {
  return typeof value === "string" && (HIGHLIGHT_STATES as readonly string[]).includes(value);
}

/**
 * What a hovered or focused preview row asks for.
 *
 * `explaining` rather than `needs-input`: the row is pointing the user at a field,
 * not telling them to type in it — and `needs-input` is the one state that pulses,
 * which would make every hover flash the page.
 */
export const ROW_HIGHLIGHT: HighlightState = "explaining";
