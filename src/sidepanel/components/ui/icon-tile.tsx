import type { ReactNode } from "react";

/**
 * The tinted square an icon sits in.
 *
 * Two shapes, because the design uses two: a circle behind a quick prompt's
 * glyph and a rounded square on the connect card. Both are `--green-50` with a
 * `--green-900` icon, which is the product's one tinted-fill pairing.
 */

export interface IconTileProps {
  size: number;
  shape?: "circle" | "rounded";
  children: ReactNode;
}

export function IconTile({ size, shape = "circle", children }: IconTileProps) {
  return (
    <span
      aria-hidden
      className={`inline-flex flex-none items-center justify-center bg-green-50 text-green-900 ${
        shape === "circle" ? "rounded-full" : "rounded-[10px]"
      }`}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}
