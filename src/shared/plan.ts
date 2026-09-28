import type { ActionType, FieldId } from "@/shared/actions";

/**
 * The plan, as the panel renders it.
 *
 * This mirrors `POST /plan` in naijagov-api (`src/plan/schemas.py`), translated
 * into this repo's vocabulary: the wire speaks snake_case, the panel speaks
 * camelCase, and `sw/wire.ts` is the one place that crosses between them. Nothing
 * here is invented — every field below exists on `PlanResponse`, and the two
 * repos have to change together.
 *
 * `/plan` is also the one response in the system that carries **real values**:
 * they are going back to the browser the user is sitting at, to fill their own
 * form. That is why every row names where its value came from. A fill the user
 * cannot check is a fill they cannot refuse.
 */

/**
 * Whether the reply's factual claims trace to a source.
 *
 * `grounded` — every claim has a citation. `not_required` — it made no factual
 * claim, the common case, and the panel shows nothing. `unverified` — it made one
 * and nothing retrieved supports it, so the panel shows a caveat above the
 * sources.
 *
 * Spelled `grounded` and not `verified`: the backend's literal wins.
 */
export type Grounding = "grounded" | "not_required" | "unverified";

/**
 * One row of the fill preview: what would be written, where, and on whose authority.
 *
 * `source` arrives already worded for a person — "Your profile", "You told me
 * just now" — because the wording is the backend's to own and the panel must not
 * improvise a provenance claim. `sourceRef` is the same fact in our terms
 * (`profile.email`), and it is what the chip and the outgoing `ValueSource` are
 * derived from.
 *
 * `actionId` is positional (`a1`, `a2`) and is the row's identity. Deliberately
 * not `fieldId`, which is not unique across a plan — one field can be both
 * highlighted and filled.
 */
export interface PlannedRow {
  actionId: string;
  type: ActionType;
  fieldId?: FieldId;
  label?: string;
  value?: string;
  checked?: boolean;
  /** The backend's sentence for where the value came from. Shown verbatim. */
  source?: string;
  /** `profile.email` / `chat.lga`. Ours to read, never shown raw to the user. */
  sourceRef?: string;
  /** The model's own prose about this row, if it offered any. */
  reason?: string;
  note?: string;
  /**
   * The guard's one soft outcome: the value resolved and the field accepted it,
   * but the key and the label disagree. Offered with a warning rather than
   * dropped, because dropping it refuses legitimate fills.
   */
  suspicious: boolean;
}

/**
 * One suggestion the guard refused.
 *
 * Shown, never hidden. "This field needs you — I don't fill passwords or codes"
 * reads as careful; silence reads as an incomplete tool. `reason` is the
 * backend's sentence and is printed verbatim — the rejection code behind it stays
 * in their log and never reaches the panel.
 */
export interface BlockedRow {
  fieldId?: FieldId;
  label?: string;
  reason: string;
}

/** A field the plan has no value for, and the question that would get one. */
export interface MissingItem {
  fieldId: FieldId;
  label: string;
  question: string;
}

/**
 * A source behind a factual claim.
 *
 * `retrievedAt` is when the corpus last read that source, not when this answer
 * was written, and it is absent when the backend does not hold one — the panel
 * shows no date rather than borrowing today's and implying the source was checked
 * this morning.
 */
export interface Citation {
  title: string;
  url: string;
  retrievedAt?: string;
}

/** Where this page sits in its workflow. Absent for a page the registry doesn't know. */
export interface PlanStep {
  id: string;
  name: string;
  index: number;
  total: number;
}

/**
 * A whole plan, ready to render.
 *
 * `planId` is what goes back on approval, so `/results` can be matched against
 * what was actually proposed rather than against whatever the extension claims it
 * did.
 */
export interface Plan {
  planId: string;
  cached: boolean;
  /** Our correlation id, echoed back untouched, so a reply matches its request. */
  clientPlanId?: string;
  reply: string;
  actions: PlannedRow[];
  rejected: BlockedRow[];
  missing: MissingItem[];
  citations: Citation[];
  grounding: Grounding;
  step?: PlanStep;
}

/**
 * What `POST /context` told us about the page.
 *
 * `pageHash` is **the server's** hash and the extension adopts it, because it is
 * what `/plan`'s `PAGE_CHANGED` check compares against. It is not our own
 * structural hash and the two never agree — see `docs/page-hash.md`.
 */
export interface PageContext {
  sessionId: string;
  supported: boolean;
  pageHash: string;
  cached: boolean;
  message?: string;
  workflow?: { id: string; name: string; agency: string };
  step?: { id: string; name: string; index: number; total: number; isFinal: boolean };
  confidence?: "high" | "low";
  checkpoint?: { present: boolean; count: number };
  rulesLoaded: number;
}

/**
 * The codes a turn can fail with.
 *
 * Every one but `OFFLINE` is the backend's, from `ErrorCode` in `src/constants.py`.
 * `OFFLINE` is ours: nothing answered at all, which is not a code any server can
 * send. The panel branches on these; it prints the accompanying `message`
 * verbatim and never invents a technical explanation of its own.
 */
export const PLAN_ERROR_CODES = [
  "PAGE_CHANGED",
  "SESSION_NOT_FOUND",
  "SESSION_BUSY",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "MODEL_UNAVAILABLE",
  "MODEL_TIMEOUT",
  "PLAN_FAILED",
  "UNAUTHENTICATED",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "INTERNAL",
  "OFFLINE",
] as const;

export type PlanErrorCode = (typeof PLAN_ERROR_CODES)[number];

export function isPlanErrorCode(value: unknown): value is PlanErrorCode {
  return typeof value === "string" && (PLAN_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * A failed turn, as the panel shows it.
 *
 * `message` is the backend's own sentence. `retryAfter` is seconds, and only
 * `RATE_LIMITED` carries one.
 */
export interface PlanError {
  code: PlanErrorCode;
  message: string;
  retryAfter?: number;
}

/**
 * Which codes are worth a Retry button.
 *
 * A model that was briefly unavailable and a request that never left the machine
 * are both worth pressing again. A page that changed is not — the user is asked
 * to send their message again, because they may want to say something different
 * now. A busy session is not either: something is still running.
 */
export const RETRYABLE_ERROR_CODES = [
  "MODEL_UNAVAILABLE",
  "MODEL_TIMEOUT",
  "PLAN_FAILED",
  "OFFLINE",
  "INTERNAL",
] as const satisfies readonly PlanErrorCode[];

export function isRetryable(code: PlanErrorCode): boolean {
  return (RETRYABLE_ERROR_CODES as readonly PlanErrorCode[]).includes(code);
}
