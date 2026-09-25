import { TOKEN_KEY } from "@/shared/state";

/**
 * The backend client, and the only file in this repo that calls `fetch`.
 *
 * Everything the extension knows that it did not read off the page comes from
 * here: every explanation, every plan, every government rule. None of it is
 * decided in the browser. ESLint enforces the "only file" part — see
 * `no-restricted-globals` in `eslint.config.js`.
 */

const DEFAULT_BASE = "http://localhost:8787";

/** No hardcoded hosts. `.env` sets this; the default is the local backend. */
const API_BASE = (import.meta.env.VITE_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");

export class ApiError extends Error {
  /** 0 when the request never reached a server. */
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }

  /** The backend is there but does not accept our token. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Nothing answered. Usually the backend simply is not running. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

/**
 * The extension token, created by the user on the web app and pasted into the
 * connect screen.
 *
 * `chrome.storage.local` is not encrypted. It holds the token and a profile
 * cache and nothing more sensitive than that, and the connect screen says so.
 */
async function getToken(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = stored[TOKEN_KEY];
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

export interface ApiFetchOptions {
  method?: "GET" | "POST";
  /** Serialized as JSON. Never contains a value read off the page. */
  body?: unknown;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Deliberately not the underlying message: it varies by platform and can
    // carry the URL into a UI string.
    throw new ApiError(0, path, "Could not reach the server.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, path, `The server returned ${response.status}.`);
  }

  return (await response.json()) as T;
}

export interface HealthResponse {
  ok: boolean;
  version?: string;
}

/**
 * `GET /health`.
 *
 * Allowed to fail. The backend may not exist yet, and the panel shows that as
 * "backend offline" — a line of text, not a crash.
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health", { signal });
}
