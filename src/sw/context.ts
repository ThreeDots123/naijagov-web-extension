import type { PageSnapshot } from "@/shared/page";
import type { PageContextRef } from "@/shared/state";
import { postContext } from "@/sw/api";
import { toContextRequest } from "@/sw/payload";
import { getSession, setSession } from "@/sw/session";

/**
 * The session a plan is planned within.
 *
 * `POST /plan` requires a `session_id` and there is no other way to get one, so
 * `/context` is not optional groundwork — it is the first half of every turn. This
 * is the call `sw/page.ts` deliberately left out until the endpoint's shape was
 * known rather than guessed.
 *
 * ## The two hashes
 *
 * There are two, they measure different things, and neither can do the other's job.
 *
 *  - **Ours** is FNV-1a 64-bit over the whole canonical snapshot (`shared/page-hash.ts`).
 *    It is synchronous, needs no platform crypto — `crypto.subtle` is unavailable on
 *    the `http://` origins a local portal replica runs on — and it is what the
 *    observer uses to decide whether the page became a different page.
 *  - **Theirs** is SHA-256 over the URL path and the `(field_id, label, type)` triples
 *    (`src/context/utils.py`). It is what `/plan` compares against to raise
 *    `PAGE_CHANGED`.
 *
 * They will never agree, and the backend's contract says so: `/context` returns its
 * own hash and the extension **adopts** it, while the `page_hash` we send is
 * "compared, never trusted". So both are stored. Theirs goes back out on `/plan`;
 * ours decides when this context is stale and when an approval is too late.
 *
 * `docs/page-hash.md` currently describes ours as the algorithm the backend mirrors.
 * That is no longer true and the doc needs correcting.
 */

/**
 * The context for this page, reused when it still applies.
 *
 * Reused rather than re-posted on every turn: `/context` matches a workflow step and
 * loads rules, and a second call for a page that has not changed is work nobody
 * asked for. Staleness is judged on **our** hash, because comparing our hash to our
 * hash is the only comparison that means anything without a round trip.
 */
export async function ensureContext(
  tabId: number,
  snapshot: PageSnapshot,
): Promise<PageContextRef> {
  const session = await getSession(tabId);
  const existing = session.context;

  if (existing && existing.localPageHash === snapshot.pageHash) return existing;

  const context = await postContext(toContextRequest(snapshot, tabId));

  const ref: PageContextRef = {
    sessionId: context.sessionId,
    serverPageHash: context.pageHash,
    localPageHash: snapshot.pageHash,
    supported: context.supported,
  };

  await setSession(tabId, { context: ref });

  return ref;
}

/**
 * Forget the context for a tab.
 *
 * Called when the backend tells us the page moved under us. The next turn posts
 * `/context` again rather than planning against a session that describes a page that
 * is no longer there.
 */
export async function clearContext(tabId: number): Promise<void> {
  await setSession(tabId, { context: undefined });
}
