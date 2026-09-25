import { useId, useState } from "react";
import { Link } from "@/sidepanel/components/icons";
import { IconTile } from "@/sidepanel/components/ui/icon-tile";

/**
 * Shown whenever there is no token.
 *
 * It replaces the greeting and the prompts rather than sitting over them:
 * without a token nothing else works, so showing the rest greyed out would be
 * decoration that implies the panel is nearly ready when it is not.
 */

export interface ConnectCardProps {
  onOpenProfile: () => void;
  /**
   * Store the pasted token.
   *
   * No verification in this task — checking it against `/me` belongs to the
   * connect task. This writes it and lets the panel re-render.
   */
  onConnect: (token: string) => void;
}

export function ConnectCard({ onOpenProfile, onConnect }: ConnectCardProps) {
  const [pasting, setPasting] = useState(false);
  const [token, setToken] = useState("");
  const inputId = useId();

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="mt-4 rounded-[10px] border border-rule bg-surface p-5"
    >
      <IconTile size={40} shape="rounded">
        <Link size={20} />
      </IconTile>

      <h2 id={`${inputId}-heading`} className="mt-3 text-[17px] font-bold text-ink">
        Connect your account
      </h2>

      <p className="mt-2 text-[14px] leading-[1.55] text-ink-muted">
        The Copilot needs a token from your NaijaGov account before it can read a form or fill
        anything in. You create one on the web app, then paste it here.
      </p>

      <p className="mt-3 text-[12.5px] leading-[1.5] text-ink-faint">
        The token is kept in your browser&rsquo;s extension storage, which is not encrypted. Keep it
        to yourself the way you would a password.
      </p>

      <button
        type="button"
        onClick={onOpenProfile}
        className="mt-4 h-10 w-full rounded-md bg-green-900 text-[14.5px] font-semibold text-white transition-colors duration-150 hover:bg-green-700"
      >
        Open your profile
      </button>

      {pasting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (token.trim().length > 0) onConnect(token);
          }}
          className="mt-3"
        >
          <label htmlFor={inputId} className="sr-only">
            Extension token
          </label>

          <input
            id={inputId}
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            // Not a field the browser should remember or correct for us.
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="Paste your token"
            className="h-10 w-full rounded-md border border-rule bg-page px-3 text-[13px] text-ink placeholder:text-ink-faint focus-visible:border-green-900"
          />

          <button
            type="submit"
            disabled={token.trim().length === 0}
            className="mt-2 h-10 w-full rounded-md border border-green-900 text-[14px] font-semibold text-green-900 transition-colors duration-150 hover:bg-green-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Connect
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="mt-3 rounded text-[13px] text-green-900 hover:underline"
        >
          Paste token
        </button>
      )}
    </section>
  );
}
