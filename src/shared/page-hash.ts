import type { PageSnapshot } from "@/shared/page";

/**
 * The page hash.
 *
 * **This algorithm is implemented twice** — here, and again in naijagov-api,
 * which recomputes it to decide whether a plan was built against the page the
 * browser is looking at now. If the two drift, `/plan` either refuses valid
 * requests or accepts stale ones, and both are bad in different directions.
 *
 * So the definition is written down in `docs/page-hash.md` and both sides are
 * tested against the fixtures in `fixtures/page-hash.json`. Change the algorithm
 * and you change three things: the doc, the fixtures, and both implementations.
 *
 * FNV-1a rather than SHA-256 deliberately. `crypto.subtle` does not exist in a
 * content script on a plain `http://` page — it needs a secure context, and
 * government portals are not reliably https. FNV-1a is synchronous, needs no
 * platform API, and 64 bits is far more than change detection requires.
 */

/** Bumped if the canonical form ever changes, so a stale hash cannot look fresh. */
export const PAGE_HASH_VERSION = "v1";

/** Between the parts of one field. ASCII US. */
const UNIT = "\u001f";
/** Between options inside one field. ASCII RS. */
const OPTION = "\u001e";
/** Between fields, and between the header lines. */
const RECORD = "\n";

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const U64 = (1n << 64n) - 1n;

/**
 * Normalise text for hashing — never for display.
 *
 * Aggressive on purpose: the two sides must agree about a label that a portal
 * renders with a stray non-breaking space one day and not the next.
 */
export function normaliseForHash(text: string): string {
  let value = text.normalize("NFKC").replace(/\s+/g, " ").trim();

  // A portal marks a required field in the label itself, and whether it does is
  // a styling decision that must not change the hash.
  let previous: string;
  do {
    previous = value;
    value = value
      .replace(/\s*\(\s*required\s*\)$/i, "")
      .replace(/\s*\*+$/, "")
      .trim();
  } while (value !== previous);

  return value.toLowerCase();
}

/**
 * The exact string that gets hashed.
 *
 * Separate from `hashPage` so a disagreement between the two implementations can
 * be diffed as text rather than as two hex strings that differ.
 *
 * In, in this order: the version marker, the URL's origin and path, then one line
 * per field carrying its type, normalised label, whether it is required, and its
 * normalised option labels.
 *
 * Out, deliberately: ids, the generation number, every field's value, the query
 * string, buttons, headings, and DOM order beyond the order of the fields
 * themselves. A snapshot differing only in those describes the same page.
 */
export function canonicalizePage(snapshot: Omit<PageSnapshot, "pageHash">): string {
  const lines = [PAGE_HASH_VERSION, normaliseUrl(snapshot.url)];

  for (const field of snapshot.fields) {
    const options = (field.options ?? [])
      .map((option) => normaliseForHash(option.label))
      .join(OPTION);

    lines.push(
      [field.type, normaliseForHash(field.label), field.required ? "1" : "0", options].join(UNIT),
    );
  }

  return lines.join(RECORD);
}

/** FNV-1a, 64-bit, over the UTF-8 bytes. Sixteen lowercase hex characters. */
export function fnv1a64(input: string): string {
  const bytes = new TextEncoder().encode(input);

  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & U64;
  }

  return hash.toString(16).padStart(16, "0");
}

export function hashPage(snapshot: Omit<PageSnapshot, "pageHash">): string {
  return fnv1a64(canonicalizePage(snapshot));
}

/**
 * Origin and path, with a trailing slash removed.
 *
 * The serializer already cuts the query string before a snapshot exists; doing it
 * again here is not defensiveness but the definition — the backend receives a URL
 * string from a body it did not build and must reduce it the same way.
 */
function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${path}`;
  } catch {
    return url.trim();
  }
}
