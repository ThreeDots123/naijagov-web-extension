import { fetchSnapshot, receiveSnapshot } from "@/sw/page";
import { setState } from "@/sw/session";

/**
 * Read the page again and let `receiveSnapshot` decide where that leaves the tab.
 *
 * Used by both halves of a turn — a plan that came back `PAGE_CHANGED`, and an approval
 * that found the page had moved — so it lives beside neither of them.
 */
export async function reread(tabId: number): Promise<void> {
  await setState(tabId, "READING");
  const snapshot = await fetchSnapshot(tabId);
  await receiveSnapshot(snapshot, tabId);
}
