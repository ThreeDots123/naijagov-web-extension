import type { SensitiveKind } from "@/shared/page";

/**
 * The detector's rule data.
 *
 * Everything the detector knows lives here as data, in one file, so adding a
 * payment provider is a one-line change that a reviewer can read at a glance.
 * There is no logic in this file beyond matching — the rules are the point, and a
 * rule buried inside a function is a rule nobody audits.
 *
 * Nothing here ever takes a hint from the page about what is safe. Page text is
 * untrusted input; these lists are the fixed side of the comparison.
 */

/**
 * A third-party host, matched as the host itself or any subdomain of it.
 *
 * Suffix matching on a parsed hostname rather than a substring search, because
 * `paystack.com.attacker.example` contains the string "paystack.com" and is not
 * Paystack. A detector that can be fooled by a hostname is not a detector.
 */
export interface HostRule {
  host: string;
  /** For providers that share a host with unrelated things. */
  path?: string;
  /** The provider's name, for the line the user reads. */
  name: string;
}

export const CAPTCHA_HOSTS: readonly HostRule[] = [
  { host: "google.com", path: "/recaptcha", name: "reCAPTCHA" },
  { host: "gstatic.com", path: "/recaptcha", name: "reCAPTCHA" },
  { host: "recaptcha.net", name: "reCAPTCHA" },
  { host: "hcaptcha.com", name: "hCaptcha" },
  { host: "challenges.cloudflare.com", name: "Cloudflare Turnstile" },
];

export const PAYMENT_HOSTS: readonly HostRule[] = [
  { host: "remita.net", name: "Remita" },
  { host: "paystack.com", name: "Paystack" },
  { host: "paystack.co", name: "Paystack" },
  { host: "interswitchng.com", name: "Interswitch" },
  { host: "interswitchgroup.com", name: "Interswitch" },
  { host: "flutterwave.com", name: "Flutterwave" },
  { host: "ravepay.co", name: "Flutterwave" },
  { host: "stripe.com", name: "Stripe" },
];

export interface TextRule {
  pattern: RegExp;
  kind: SensitiveKind;
}

/**
 * Field name, id and label patterns.
 *
 * Matched against a haystack whose separators have been turned into spaces, so
 * `pin_code` and `pin-code` read the same as `PIN code`. The word boundaries are
 * load-bearing: `passport_number` must not look like a password, and
 * `shipping` must not look like a PIN.
 */
export const SENSITIVE_FIELD_PATTERNS: readonly TextRule[] = [
  { pattern: /\bpasswords?\b/i, kind: "password" },
  { pattern: /\bpass\s?codes?\b/i, kind: "password" },
  { pattern: /\bpins?\b/i, kind: "password" },
  { pattern: /\bsecurity\s+(question|answer)\b/i, kind: "password" },
  { pattern: /\botps?\b/i, kind: "otp" },
  { pattern: /\bone\s?time\b/i, kind: "otp" },
  { pattern: /\bverification\s+code\b/i, kind: "otp" },
  { pattern: /\bauthorisation\s+code\b/i, kind: "otp" },
  { pattern: /\bauthorization\s+code\b/i, kind: "otp" },
  { pattern: /\bcvv\b/i, kind: "payment" },
  { pattern: /\bcvc\b/i, kind: "payment" },
  { pattern: /\bcard\s+number\b/i, kind: "payment" },
  // Card expiry needs the card cue. On its own, "expiry date" is an ordinary
  // field — a driver's licence has one — and the `cc-exp` autocomplete token
  // below is the reliable signal for the card version.
  { pattern: /\bcard\b[^.]{0,20}\bexpir/i, kind: "payment" },
  { pattern: /\bexpir\w*\b[^.]{0,20}\bcard\b/i, kind: "payment" },
];

/**
 * Button and link text.
 *
 * `Continue` is deliberately absent: it is the commonest ordinary button on a
 * multi-step form. It is still never clicked by the Copilot — that is the
 * executor's allowlist, not a detector flag.
 */
export const SENSITIVE_BUTTON_PATTERNS: readonly TextRule[] = [
  { pattern: /\bpay\b/i, kind: "payment" },
  { pattern: /\bmake\s+(a\s+)?payment\b/i, kind: "payment" },
  { pattern: /\bproceed\s+to\s+payment\b/i, kind: "payment" },
  { pattern: /\bsubmit\b/i, kind: "submit" },
  { pattern: /\bconfirm\w*\b/i, kind: "submit" },
  { pattern: /\bauthori[sz]e\b/i, kind: "submit" },
  { pattern: /\bverify\b/i, kind: "submit" },
  { pattern: /\bcomplete\s+registration\b/i, kind: "submit" },
];

/** What the user is told. Says what they must do, never how to get around it. */
export const SENSITIVE_REASONS: Record<SensitiveKind, string> = {
  password: "Passwords are yours to type. The Copilot won't fill this.",
  otp: "Only you can read this code, so only you can enter it.",
  captcha: "This check has to be done by a person. Complete it yourself to carry on.",
  payment: "Payments are handled by the provider. The Copilot stops here.",
  submit: "Sending the form is your decision, so this button is yours to press.",
  upload: "Choosing a file from your device is something only you can do.",
  unknown: "The Copilot won't touch this one.",
};

/** Turn a name, id or label into a haystack the patterns above can read. */
export function haystack(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .replace(/[_\-.[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchText(text: string, rules: readonly TextRule[]): SensitiveKind | undefined {
  if (!text) return undefined;
  for (const rule of rules) {
    if (rule.pattern.test(text)) return rule.kind;
  }
  return undefined;
}

/** Does this URL belong to one of the providers in `rules`? */
export function matchHost(url: string, rules: readonly HostRule[]): HostRule | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const hostname = parsed.hostname.toLowerCase();

  return rules.find(
    (rule) =>
      (hostname === rule.host || hostname.endsWith(`.${rule.host}`)) &&
      (rule.path === undefined || parsed.pathname.startsWith(rule.path)),
  );
}

/**
 * An `autocomplete` token that marks a credential or a card.
 *
 * The attribute can carry several space-separated tokens, and `cc-` covers the
 * whole card family in one rule — `cc-number`, `cc-exp`, `cc-csc`.
 */
export function matchAutocomplete(value: string | null): SensitiveKind | undefined {
  if (!value) return undefined;

  const tokens = value.toLowerCase().split(/\s+/);

  if (tokens.includes("one-time-code")) return "otp";
  if (tokens.some((token) => token.startsWith("cc-"))) return "payment";
  if (tokens.some((token) => token.endsWith("password"))) return "password";

  return undefined;
}
