import type { CopilotTurn, Turn } from "@/shared/chat";
import { capTurns, chatKey, isTranscript } from "@/shared/chat";

/**
 * A tab's transcript, in `chrome.storage.session`.
 *
 * The same rule as `session.ts` and for the same reason: no cache, every call reads
 * storage. The worker is stopped after about thirty seconds idle, and a transcript
 * held in a module variable would come back empty in the middle of a conversation.
 *
 * The panel reads this directly through `chrome.storage.onChanged`, which is why
 * there is no "transcript changed" message: one writer, one store, and the panel
 * subscribes to the store rather than to an announcement about it.
 */

export async function getTurns(tabId: number): Promise<Turn[]> {
  const key = chatKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const value = stored[key];

  return isTranscript(value) ? value : [];
}

async function writeTurns(tabId: number, turns: readonly Turn[]): Promise<void> {
  await chrome.storage.session.set({ [chatKey(tabId)]: capTurns(turns) });
}

/** Append a turn and return the transcript as it now stands. */
export async function appendTurn(tabId: number, turn: Turn): Promise<Turn[]> {
  const turns = [...(await getTurns(tabId)), turn];
  await writeTurns(tabId, turns);

  return capTurns(turns);
}

/**
 * Merge a patch into one Copilot turn.
 *
 * Used to move a preview from `pending` to `approved`, `cancelled` or `stale`. A
 * turn id that is no longer in the transcript is not an error: it may have been
 * pushed past the cap by a long conversation, and there is nothing left to update.
 */
export async function patchTurn(
  tabId: number,
  turnId: string,
  patch: Partial<Omit<CopilotTurn, "id" | "role">>,
): Promise<void> {
  const turns = await getTurns(tabId);
  let changed = false;

  const next = turns.map((turn) => {
    if (turn.id !== turnId || turn.role !== "copilot") return turn;
    changed = true;

    return { ...turn, ...patch };
  });

  if (changed) await writeTurns(tabId, next);
}

/**
 * Mark every pending preview in a tab as no longer actionable.
 *
 * There is normally at most one, but a checkpoint can fire at any moment and a card
 * left showing live controls after one would be offering to fill a page the detector
 * has just refused. `stale` is the right word for both causes: the plan was built
 * against a page that no longer applies.
 */
export async function stalePendingPreviews(tabId: number): Promise<void> {
  const turns = await getTurns(tabId);
  let changed = false;

  const next = turns.map((turn) => {
    if (turn.role !== "copilot" || turn.status !== "pending") return turn;
    changed = true;

    return { ...turn, status: "stale" as const };
  });

  if (changed) await writeTurns(tabId, next);
}

export async function clearChat(tabId: number): Promise<void> {
  await chrome.storage.session.remove(chatKey(tabId));
}
