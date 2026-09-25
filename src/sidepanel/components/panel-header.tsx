import { X } from "@/sidepanel/components/icons";

/**
 * The panel header.
 *
 * Carries the product's one `<h1>`. No shadow — the hairline does the
 * separating, the same way it does everywhere else in the product.
 */

export function PanelHeader() {
  return (
    <header className="flex h-14 flex-none items-center gap-[10px] border-b border-rule bg-surface px-4">
      <span className="n-mark size-[26px] text-green-900" aria-hidden />

      <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-[-0.01em] text-ink">
        NaijaGov
      </h1>

      <button
        type="button"
        onClick={() => window.close()}
        aria-label="Close panel"
        className="-mr-2 inline-flex size-8 flex-none items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-page hover:text-ink"
      >
        <X size={16} />
      </button>
    </header>
  );
}
