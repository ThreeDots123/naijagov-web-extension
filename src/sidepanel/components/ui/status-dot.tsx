import type { StatusTone } from "@/sidepanel/lib/status";

/**
 * The status dot.
 *
 * Always decorative. Colour never carries status on its own here — every dot in
 * the panel sits beside the label that says the same thing in words — so this is
 * `aria-hidden` and has no accessible name to give.
 */

export interface StatusDotProps {
  tone: StatusTone;
  /** Pulses while something is in flight. Held still under reduced motion. */
  busy?: boolean;
  /** Diameter of the dot itself; the halo adds 2px all round. */
  size?: number;
}

export function StatusDot({ tone, busy = false, size = 8 }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className="relative inline-flex flex-none items-center justify-center"
      // The tone sets `color`, and both circles draw from `currentColor`, so the
      // halo cannot drift out of step with the dot it surrounds.
      style={{ width: size + 4, height: size + 4, color: `var(--tone-${tone})` }}
    >
      <span className="absolute inset-0 rounded-full bg-current opacity-[0.18]" />
      <span
        className={`rounded-full bg-current ${busy ? "dot-pulse" : ""}`}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
