/** No hardcoded hosts. `.env` sets this; the default is the local web app. */
const WEB_BASE = (import.meta.env.VITE_WEB_BASE ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Shown when there is no token yet.
 *
 * Deliberately not the connect screen: no input, no validation, no `/me`. That
 * flow is its own task. This says what is missing and where to get it.
 */
export function ConnectPlaceholder() {
  return (
    <section
      aria-labelledby="connect-heading"
      className="rounded-lg border border-rule bg-surface p-4"
    >
      <h2 id="connect-heading" className="text-base font-semibold text-ink">
        Connect your account
      </h2>

      <p className="mt-2 text-ink-muted">
        The Copilot needs a token from your NaijaGov account before it can read a form or fill
        anything in. You create one on the web app and paste it here.
      </p>

      <p className="mt-3 text-ink-faint">
        The token is kept in your browser&rsquo;s extension storage, which is not encrypted. Keep it
        to yourself the way you would a password.
      </p>

      <a
        href={`${WEB_BASE}/profile`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-md bg-green-900 px-3 py-2 font-medium text-white hover:bg-green-700"
      >
        Open your profile
      </a>
    </section>
  );
}
