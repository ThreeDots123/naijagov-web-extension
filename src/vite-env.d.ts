/// <reference types="vite/client" />

/**
 * The environment this build was made with.
 *
 * Both are hosts, both have local defaults, and neither is written into source.
 * See `.env.example`.
 */
interface ImportMetaEnv {
  /** The naijagov-api base URL. Defaults to http://localhost:8787. */
  readonly VITE_API_BASE?: string;
  /** The naijagov-web base URL, for the link to the user's profile. */
  readonly VITE_WEB_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
