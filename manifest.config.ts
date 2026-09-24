import { defineManifest } from "@crxjs/vite-plugin";
import { HOST_MATCHES } from "./src/shared/hosts.ts";

/**
 * The MV3 manifest, typed.
 *
 * `host_permissions` and `content_scripts[].matches` are both spread from
 * HOST_MATCHES — see `src/shared/hosts.ts`, which is also what the service
 * worker checks a tab against. One list, three consumers, no drift.
 *
 * Permissions are the minimum the extension can work with. Each one costs review
 * time and user trust, so adding one is a decision, not a step.
 *
 * The two entry points are named for what they are — `service-worker.ts` and
 * `content-script.ts` — and not both `index.ts`. CRXJS generates the content
 * script's loader by matching on the entry's basename, so two entries called
 * `index.ts` are ambiguous, and it wired the loader to the service worker.
 * The page then got the worker injected into it, where it threw on
 * `chrome.runtime.onInstalled` before registering a single listener. Keep the
 * basenames distinct.
 */
export default defineManifest({
  manifest_version: 3,
  name: "NaijaGov Copilot",
  version: "0.1.0",
  description:
    "Explains what a government form is asking for and fills in details you have already given it. Independent; not affiliated with any agency.",

  permissions: ["sidePanel", "storage", "scripting", "activeTab", "tabs"],
  host_permissions: [...HOST_MATCHES],

  background: {
    service_worker: "src/sw/service-worker.ts",
    type: "module",
  },

  side_panel: {
    default_path: "src/sidepanel/index.html",
  },

  content_scripts: [
    {
      matches: [...HOST_MATCHES],
      js: ["src/content/content-script.ts"],
      run_at: "document_idle",
    },
  ],

  action: {
    default_title: "Open NaijaGov Copilot",
  },

  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
});
