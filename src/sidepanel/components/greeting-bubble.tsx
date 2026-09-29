/**
 * The opening message.
 *
 * On a page we don't know, the sub line says so. The panel never pretends to be
 * ready when it isn't — an offer to "help you navigate" on an unsupported page
 * is a promise it cannot keep.
 */

export interface GreetingBubbleProps {
  supported: boolean;
  /** Stopped at a checkpoint. The quick prompts below are disabled, so don't offer them. */
  stopped: boolean;
}

export function GreetingBubble({ supported, stopped }: GreetingBubbleProps) {
  return (
    <section className="flex gap-3 rounded-[10px] bg-green-50 p-4">
      <span className="n-mark mt-0.5 size-7 text-green-900" aria-hidden />

      <div className="min-w-0">
        <h2 className="text-[16.5px] font-bold leading-[1.3] text-ink">
          I can help you navigate this website.
        </h2>

        <p className="mt-1.5 text-[13.5px] leading-[1.45] text-ink-muted">
          {stopped
            ? "This page needs something only you can do — see below. Ask me anything about it."
            : supported
              ? "Tell me what you're trying to do, or choose an option below."
              : "I don't know this page yet, but I can still answer questions about it."}
        </p>
      </div>
    </section>
  );
}
