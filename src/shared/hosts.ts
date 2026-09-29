/**
 * The one host list.
 *
 * `host_permissions` and the content script's `matches` are both generated from
 * this array, and the service worker uses it to tell whether a tab is one we are
 * allowed to touch. Two lists that must agree will eventually disagree, so there
 * is only ever one.
 *
 * Adding an entry here widens what the extension can reach. It is a deliberate,
 * reviewed change — never a convenience edit.
 */
export const HOST_MATCHES = [
  // The local test fixture in `replica/`, served by `npm run replica` on 5174.
  //
  // No port, because a Chrome match pattern cannot carry one — `localhost:5174`
  // is not a host Chrome will parse, and a pattern it rejects is a content
  // script that never injects. So this matches any port on localhost, and the
  // matcher below has to do the same or the two disagree: the worker would
  // think a page was supported while Chrome had never injected anything into it.
  "http://localhost/*",

  // The demo portal: the FRSC driver's-licence application. The first live host
  // this extension reads and fills a form on.
  "https://nigeriadriverslicence.frsc.gov.ng/*",
] as const;

export type HostMatch = (typeof HOST_MATCHES)[number];

/**
 * Does this URL fall under one of our host matches?
 *
 * A deliberately small subset of Chrome's match-pattern syntax — exactly the
 * shapes `HOST_MATCHES` uses: `<scheme>://<host>/<path>` with an optional
 * leading `*.` on the host and a trailing `*` on the path. Anything it does not
 * understand is treated as "no match", because the failure we want is a refusal
 * to act, never an accidental reach onto a page we have no business reading.
 */
export function matchesSupportedHost(url: string | undefined): boolean {
  if (!url) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return HOST_MATCHES.some((pattern) => matchesPattern(parsed, pattern));
}

function matchesPattern(url: URL, pattern: string): boolean {
  const schemeEnd = pattern.indexOf("://");
  if (schemeEnd === -1) return false;

  const scheme = pattern.slice(0, schemeEnd);
  const rest = pattern.slice(schemeEnd + 3);
  const pathStart = rest.indexOf("/");
  if (pathStart === -1) return false;

  const host = rest.slice(0, pathStart);
  const path = rest.slice(pathStart);

  if (`${scheme}:` !== url.protocol) return false;
  // `hostname`, not `host`: `host` carries the port, and matching on it would
  // make this stricter than the manifest patterns Chrome actually enforces.
  if (!hostMatches(url.hostname, host)) return false;
  return pathMatches(url.pathname + url.search, path);
}

function hostMatches(actual: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.gov.ng"
    return actual === pattern.slice(2) || actual.endsWith(suffix);
  }
  return actual === pattern;
}

function pathMatches(actual: string, pattern: string): boolean {
  if (!pattern.includes("*")) return actual === pattern;
  const [prefix = "", ...tail] = pattern.split("*");
  if (!actual.startsWith(prefix)) return false;
  // Every remaining literal segment must appear, in order, after the last match.
  let cursor = prefix.length;
  for (const segment of tail) {
    if (segment === "") continue;
    const found = actual.indexOf(segment, cursor);
    if (found === -1) return false;
    cursor = found + segment.length;
  }
  return true;
}
