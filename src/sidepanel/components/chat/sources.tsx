import { useState } from "react";
import type { Citation, Grounding } from "@/shared/plan";
import { ExternalLink } from "@/sidepanel/components/icons";

/**
 * Where a claim came from, and when we last checked.
 *
 * **No source, no claim.** A reply with a citation shows it; a reply the backend could
 * not ground shows a caveat above it and says so plainly. The panel never improvises
 * either line — the backend's `grounding` verdict decides which appears, so an
 * unverified answer cannot be dressed up as a confirmed one by a rendering decision.
 *
 * `not_required` is the common case and shows nothing at all: most turns make no
 * factual claim about a government rule, and a "no sources" note under every one of
 * them would train the user to ignore the line that matters.
 */

export interface SourcesProps {
  citations: readonly Citation[];
  grounding: Grounding;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * A date the backend gave us, as `12 Sep 2026`. Its own string if it won't parse.
 *
 * Read off the `YYYY-MM-DD` rather than through `new Date()`, for two reasons that
 * both produce a wrong date rather than a crash:
 *
 *  - `new Date("2026-09-12")` is parsed as **UTC midnight**, so anywhere west of
 *    Greenwich it renders as the 11th. A citation's date is the day the corpus read
 *    the source, and showing the wrong one undermines the only thing the line is for.
 *  - `toLocaleDateString` follows the *system* locale, which on a US-configured
 *    machine gives "Sep 12, 2026". The panel's wording is fixed, so the format is too.
 */
function formatChecked(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;

  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return iso;

  return `${Number(day)} ${name} ${year}`;
}

function CitationLink({ citation }: { citation: Citation }) {
  return (
    <a
      href={citation.url}
      // Always a new tab. Navigating the tab the user is filling would lose their
      // work, and on a government portal that can mean losing the whole session.
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-baseline gap-1 text-green-900 underline decoration-green-900/30 underline-offset-2 transition-colors duration-150 hover:decoration-green-900"
    >
      <span className="min-w-0 break-words">{citation.title}</span>
      <ExternalLink size={11} className="translate-y-px" />
    </a>
  );
}

export function Sources({ citations, grounding }: SourcesProps) {
  const [expanded, setExpanded] = useState(false);

  const unverified = grounding === "unverified";
  if (citations.length === 0 && !unverified) return null;

  const [first, ...rest] = citations;

  return (
    <div className="mt-2">
      {unverified ? (
        <p className="mb-1.5 text-[11.5px] leading-[1.45] text-state-needs-input">
          I couldn&rsquo;t confirm this against an official source — please double-check it.
        </p>
      ) : null}

      {first ? (
        <p className="text-[11.5px] leading-[1.5] text-ink-faint">
          Source: <CitationLink citation={first} />
          {first.retrievedAt ? <> · checked {formatChecked(first.retrievedAt)}</> : null}
          {rest.length > 0 && !expanded ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-green-900 underline decoration-green-900/30 underline-offset-2 hover:decoration-green-900"
              >
                and {rest.length} more
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {expanded && rest.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rest.map((citation) => (
            <li key={citation.url} className="text-[11.5px] leading-[1.5] text-ink-faint">
              <CitationLink citation={citation} />
              {citation.retrievedAt ? <> · checked {formatChecked(citation.retrievedAt)}</> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
