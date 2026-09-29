/**
 * The panel's icons.
 *
 * Drawn here rather than pulled from a library: a dozen glyphs are not worth a
 * dependency that ships hundreds, and anything running inside the extension has
 * a high bar. All of them are 24-unit stroke drawings on `currentColor`, so a
 * parent sets the colour with a token and the size with a prop.
 *
 * Every icon is decorative. The adjacent label is always the accessible name,
 * so they are `aria-hidden` without exception — there is no variant that isn't.
 */

export interface IconProps {
  /** Rendered size in px. The spec pins these per use, so there is no default look. */
  size: number;
  className?: string;
}

/** Shared attributes. 1.5px strokes at every size, rounded joins. */
function strokeProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    // A fixed width in user units would thicken as the icon grows; scaling it
    // down keeps the 1.5px weight the design asks for at 17px and at 34px.
    strokeWidth: (1.5 * 24) / size,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    className,
  };
}

/** A document. `Explain this page`. */
export function FileText({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

export interface PaperPlaneProps extends IconProps {
  /**
   * Solid rather than outlined. The send button is a small glyph reversed out of
   * a dark circle, where a 1.5px stroke disappears.
   */
  solid?: boolean;
}

/** A paper plane. `Help me navigate this website`, and the send button. */
export function PaperPlane({ size, className, solid = false }: PaperPlaneProps) {
  if (solid) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        focusable={false}
        className={className}
      >
        <path d="M21.7 2.3 2.9 8.6a.9.9 0 0 0-.1 1.7l6.6 2.9 2.9 6.6a.9.9 0 0 0 1.7-.1l6.3-18.8a.7.7 0 0 0-.6-.6z" />
      </svg>
    );
  }

  return (
    <svg {...strokeProps(size, className)}>
      <path d="M21.5 2.5 2.8 9.1a.6.6 0 0 0 0 1.1l6.4 2.6 2.6 6.4a.6.6 0 0 0 1.1 0z" />
      <path d="M21.5 2.5 9.2 12.8" />
    </svg>
  );
}

/** A speech bubble with an ellipsis. `I have a different question`. */
export function ChatBubble({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H9l-4 3v-4.2A7.5 7.5 0 0 1 12.5 4.5 7.5 7.5 0 0 1 20 12z" />
      <path d="M9 12h.01" />
      <path d="M12.5 12h.01" />
      <path d="M16 12h.01" />
    </svg>
  );
}

/** Two interlocking links. The connect card's tile. */
export function Link({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}

/** The disclosure chevron on the status strip. */
export function ChevronDown({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </svg>
  );
}

/** The `↳` trailing a quick prompt. */
export function CornerDownRight({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M5 5v7a3 3 0 0 0 3 3h11" />
      <path d="M15 11l4 4-4 4" />
    </svg>
  );
}

/**
 * A paperclip. Attach a document.
 *
 * Present but inactive in the MVP — see `composer.tsx` for why it renders at all
 * when it cannot yet do anything.
 */
export function Paperclip({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M20.4 11.3 12 19.7a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}

/** Close the panel. */
export function X({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

/** A tick. Inside a checked preview row's box. */
export function Check({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

/** A pencil. Correct a proposed value. */
export function Pencil({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

/**
 * A warning triangle.
 *
 * Beside a row the guard marked `suspicious` — the value resolved and the field took
 * it, but the key and the label disagree. A warning, not a rejection.
 */
export function Warning({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <path d="M12 16.8v.2" />
    </svg>
  );
}

/**
 * An arrow leaving a box. A citation's title.
 *
 * Every source opens in a new tab: navigating the tab the user is filling would lose
 * their work, and this is the glyph that says so before they click.
 */
export function ExternalLink({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M14 4h6v6" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </svg>
  );
}

/** An open palm. The checkpoint banner's glyph: stop, a person is needed here. */
export function Hand({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 12V4.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.4-4.2a1.5 1.5 0 0 1 2.6-1.5L8 14.5" />
    </svg>
  );
}

/** A circular arrow. `Try again` on a row the page refused. */
export function Rotate({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M20 11a8 8 0 1 0-1.3 5.5" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

/** A target. `Show me` — point at the field on the page. */
export function Target({ size, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
