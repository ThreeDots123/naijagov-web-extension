import { z } from "zod";
import { ACTION_TYPES } from "@/shared/actions";
import type { PageContext, Plan } from "@/shared/plan";
import type { RunOutcome } from "@/shared/results";

/**
 * The backend's responses, parsed at the boundary.
 *
 * Nothing downstream of this file sees a snake_case key or an unvalidated shape. A
 * response that does not parse is an **error**, not a partial success: half a plan
 * rendered as a preview is a set of fills the user would be approving without being
 * shown all of them, which is the one thing the preview exists to prevent.
 *
 * `type` is checked against `ACTION_TYPES` rather than accepted as a string. The two
 * repos agree on those eight literals today; if that ever stops being true, this
 * fails loudly on the first plan instead of putting a row on screen that the
 * validator would later refuse for reasons the user cannot see.
 */

const stepSchema = z.object({
  id: z.string(),
  name: z.string(),
  index: z.number().int(),
  total: z.number().int(),
});

const plannedActionSchema = z.object({
  action_id: z.string(),
  type: z.enum(ACTION_TYPES),
  field_id: z.string().nullish(),
  label: z.string().nullish(),
  value: z.string().nullish(),
  checked: z.boolean().nullish(),
  source: z.string().nullish(),
  source_ref: z.string().nullish(),
  reason: z.string().nullish(),
  note: z.string().nullish(),
  suspicious: z.boolean().default(false),
});

const rejectedActionSchema = z.object({
  field_id: z.string().nullish(),
  label: z.string().nullish(),
  reason: z.string(),
});

const missingItemSchema = z.object({
  field_id: z.string(),
  label: z.string(),
  question: z.string(),
});

const citationSchema = z.object({
  title: z.string(),
  url: z.string(),
  retrieved_at: z.string().nullish(),
});

const planResponseSchema = z.object({
  plan_id: z.string(),
  cached: z.boolean().default(false),
  client_plan_id: z.string().nullish(),
  reply: z.string(),
  actions: z.array(plannedActionSchema).default([]),
  rejected: z.array(rejectedActionSchema).default([]),
  missing: z.array(missingItemSchema).default([]),
  citations: z.array(citationSchema).default([]),
  grounding: z.enum(["grounded", "not_required", "unverified"]).default("not_required"),
  step: stepSchema.nullish(),
});

const contextResponseSchema = z.object({
  session_id: z.string(),
  supported: z.boolean(),
  page_hash: z.string(),
  cached: z.boolean().default(false),
  message: z.string().nullish(),
  workflow: z
    .object({ id: z.string(), name: z.string(), agency: z.string() })
    .nullish(),
  step: stepSchema.extend({ is_final: z.boolean() }).nullish(),
  confidence: z.enum(["high", "low"]).nullish(),
  checkpoint: z.object({ present: z.boolean(), count: z.number().int() }).nullish(),
  rules_loaded: z.number().int().default(0),
});

/**
 * The envelope every JSON response carries.
 *
 * `src/middlewares/response.py` wraps **every** JSON body on its way out:
 *
 *   2xx → `{ "success": true, "data": <the route's own body> }`
 *   else → `{ "success": false, "error": { "code", "message", ... } }`
 *
 * So no route's declared `response_model` is what arrives on the wire — the model is
 * what goes in `data`. Reading `PlanResponse` off the top level parses nothing and
 * fails every time, which is exactly the bug this file shipped with: every turn came
 * back as "I couldn't put that into a plan."
 *
 * Strict rather than lenient. If the envelope ever goes away this fails loudly on the
 * first call, which is the failure we want from a contract two repos have to agree on.
 */
const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retry_after: z.number().nullish(),
  }),
});

/**
 * The route's own body, out of the envelope.
 *
 * Applied once, in `apiFetch`, so every endpoint below sees the shape its Python model
 * actually declares rather than each parser having to know about the wrapper.
 */
export function unwrapEnvelope(body: unknown): unknown {
  return successEnvelopeSchema.parse(body).data;
}

export interface WireErrorBody {
  code: string;
  message: string;
  retryAfter?: number;
}

/** The error body, or undefined if the failure carried something else entirely. */
export function parseErrorBody(body: unknown): WireErrorBody | undefined {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) return undefined;

  const { code, message, retry_after: retryAfter } = parsed.data.error;

  return {
    code,
    message,
    ...(typeof retryAfter === "number" ? { retryAfter } : {}),
  };
}

/** `null` and absent both mean "not present" here; the panel only knows absent. */
function optional(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parsePlan(body: unknown): Plan {
  const wire = planResponseSchema.parse(body);

  return {
    planId: wire.plan_id,
    cached: wire.cached,
    ...(optional(wire.client_plan_id) === undefined
      ? {}
      : { clientPlanId: wire.client_plan_id as string }),
    reply: wire.reply,
    actions: wire.actions.map((action) => ({
      actionId: action.action_id,
      type: action.type,
      ...(optional(action.field_id) === undefined ? {} : { fieldId: action.field_id as string }),
      ...(optional(action.label) === undefined ? {} : { label: action.label as string }),
      // Not `optional`: an empty string is a real value for a fill that clears a
      // field, and dropping it would turn "" into "no value proposed".
      ...(action.value === null || action.value === undefined ? {} : { value: action.value }),
      ...(action.checked === null || action.checked === undefined
        ? {}
        : { checked: action.checked }),
      ...(optional(action.source) === undefined ? {} : { source: action.source as string }),
      ...(optional(action.source_ref) === undefined
        ? {}
        : { sourceRef: action.source_ref as string }),
      ...(optional(action.reason) === undefined ? {} : { reason: action.reason as string }),
      ...(optional(action.note) === undefined ? {} : { note: action.note as string }),
      suspicious: action.suspicious,
    })),
    rejected: wire.rejected.map((entry) => ({
      ...(optional(entry.field_id) === undefined ? {} : { fieldId: entry.field_id as string }),
      ...(optional(entry.label) === undefined ? {} : { label: entry.label as string }),
      reason: entry.reason,
    })),
    missing: wire.missing.map((item) => ({
      fieldId: item.field_id,
      label: item.label,
      question: item.question,
    })),
    citations: wire.citations.map((citation) => ({
      title: citation.title,
      url: citation.url,
      ...(optional(citation.retrieved_at) === undefined
        ? {}
        : { retrievedAt: citation.retrieved_at as string }),
    })),
    grounding: wire.grounding,
    ...(wire.step ? { step: wire.step } : {}),
  };
}

export function parsePageContext(body: unknown): PageContext {
  const wire = contextResponseSchema.parse(body);

  return {
    sessionId: wire.session_id,
    supported: wire.supported,
    pageHash: wire.page_hash,
    cached: wire.cached,
    ...(optional(wire.message) === undefined ? {} : { message: wire.message as string }),
    ...(wire.workflow ? { workflow: wire.workflow } : {}),
    ...(wire.step
      ? {
          step: {
            id: wire.step.id,
            name: wire.step.name,
            index: wire.step.index,
            total: wire.step.total,
            isFinal: wire.step.is_final,
          },
        }
      : {}),
    ...(wire.confidence ? { confidence: wire.confidence } : {}),
    ...(wire.checkpoint ? { checkpoint: wire.checkpoint } : {}),
    rulesLoaded: wire.rules_loaded,
  };
}

/**
 * `POST /results`' response.
 *
 * Only two things are read from it, and they are the two the summary's footer is
 * made of: the sentence, and whether this page was the workflow's last step. The
 * rest — `acknowledged`, `recorded`, their recount of the totals — is their
 * bookkeeping and the panel has no business rendering it. In particular the panel
 * does **not** show their `run` counts in place of the page's own: the page is what
 * actually happened, and a disagreement between the two is a bug to find, not a
 * number to display.
 */
const resultsResponseSchema = z.object({
  acknowledged: z.boolean().default(false),
  recorded: z.number().int().default(0),
  next_hint: z.object({ code: z.string(), message: z.string() }),
  step: z
    .object({
      id: z.string(),
      index: z.number().int(),
      total: z.number().int(),
      is_final: z.boolean(),
    })
    .nullish(),
});

/** The parts of a `/results` answer the summary's footer is built from. */
export function parseRunHint(body: unknown): Pick<RunOutcome, "hint" | "finalStep"> {
  const wire = resultsResponseSchema.parse(body);

  return {
    hint: wire.next_hint.message,
    ...(wire.step ? { finalStep: wire.step.is_final } : {}),
  };
}
