/**
 * A small uppercase section label.
 *
 * Not a heading: it labels a group of controls rather than starting a section of
 * content, so it stays a `<p>` and leaves the document outline alone. The panel
 * has exactly one `<h1>` and one `<h2>`, and this is neither.
 */

export interface EyebrowProps {
  children: string;
  /** Marks the group this labels, for `aria-labelledby`. */
  id?: string;
}

export function Eyebrow({ children, id }: EyebrowProps) {
  return (
    <p
      id={id}
      className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint"
    >
      {children}
    </p>
  );
}
