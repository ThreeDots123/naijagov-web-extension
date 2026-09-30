# NaijaGov Copilot — Chrome extension

The browser layer of NaijaGov. A side panel that reads the government portal page
you are on, explains what it is asking for, fills ordinary form fields with your
own details, and stops when the page reaches anything sensitive.

Two other repos exist and none of their code lives here. **naijagov-web** is the
landing page and signed-in area, where your profile and your extension token are
created. **naijagov-api** is the backend, and every AI call, every government rule
and every stored record is its concern. This repo reads the page, shows the
panel, runs approved actions, and stops at checkpoints.

## Running it

You need Node 20 or newer and a Chromium browser.

```bash
npm install
cp .env.example .env     # both values have working local defaults
npm run build            # or: npm run dev, for a watch build
```

Then load it:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked**, and choose the `dist/` folder
4. Click the toolbar icon — the side panel opens

The panel will load and connect, but explaining, planning and filling need
`naijagov-api` running at the host in `VITE_API_BASE` (`http://localhost:8787`
by default) — that sibling repo is not part of this one. Connecting also needs
a token, minted by signing in at `naijagov-web` (`VITE_WEB_BASE`,
`http://localhost:3000` by default) and pasted into the connect card — or set
`VITE_DEMO_TOKEN` in `.env` to skip that step in a local build.

`npm run dev` is a watch build rather than a dev server. An extension loads from
`dist/`, so there is nothing for a dev server to host; CRXJS pushes updates into
the already-loaded extension as you edit.

## The test portal

Never develop against a live government service. `replica/` is a small, generic
two-page form for exactly that reason — no real agency name, no emblem, and no
imitation of any real portal's layout.

```bash
npm run replica          # serves replica/ on http://localhost:5174
```

Open `http://localhost:5174`, then use **Ping page** in the panel. It is served
over `http://localhost` and not opened as a `file://` page, because content
scripts do not run on `file://` without a permission the user has to set by hand.

The replica deliberately includes a password field, a one-time-code field, a
payment block and a "Pay and submit" button. The detector needs something to
detect and a checkpoint needs somewhere to fire.

## The mark

`public/icons/logo.svg` is the master, filled with `currentColor` so it takes its
colour from whatever renders it. The four PNGs beside it are generated from it —
the mark in `--green-900` on a `--bg-page` rounded tile, which stays legible on
both a light and a dark browser toolbar.

To regenerate after the SVG changes: render it at 512px inside a tile (the mark
at about 66% of the tile reads best at 16px), then downscale.

```bash
sips -z 128 128 icon-512.png --out public/icons/icon-128.png   # and 48, 32, 16
```

## Scripts

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Watch build into `dist/`                        |
| `npm run build`     | Production build into `dist/`                   |
| `npm run typecheck` | `tsc --noEmit`                                  |
| `npm run lint`      | ESLint                                          |
| `npm run replica`   | Serves the test portal on `localhost:5174`      |
| `npm run zip`       | Packages `dist/` for the Web Store              |

## How it is put together

Three contexts, with a hard line between them:

- **`src/content/`** — the only code that touches a page. Plain TypeScript, no
  framework: it runs inside a page we do not control, alongside that page's own
  scripts.
- **`src/sw/`** — the only code that touches the network. It sleeps after about
  thirty seconds, so its state lives in `chrome.storage.session` and never in a
  variable.
- **`src/sidepanel/`** — React, and only here.

Everything crossing between them is a typed member of `src/shared/messages.ts`.

### The safety design, briefly

The full rules are in `CLAUDE.md`. The shape of them:

- **The model never supplies a selector.** The serializer stamps `data-copilot-id`
  on what it extracts and keeps the registry. Actions reference those ids, and an
  id that is not in the current registry is rejected — never resolved some other
  way.
- **The detector runs in code**, before the model sees the page and again before
  every single action. The model's opinion can add to it. It can never override it.
- **The validator is the last gate and it lives in the browser**, not on the
  backend.
- **No value the user did not provide.** Every filled value traces to the profile
  or to something the user typed.
- **Labels and structure are serialized. Values are not.** What you have already
  typed into a page does not leave your browser, and no value is ever logged.

Page text is untrusted input on its way to a model. The id registry and the
validator are the defense, which is why neither is loosened for convenience.

## Where this task stopped

The serializer, detector, validator and executor are built and read a live page:
labels, sensitive fields, checkpoints, and the fill-and-read-back loop all work
end to end against `replica/`. So do the connect flow, chat, the fill preview,
the checkpoint banner and the results summary. See `context/current-feature.md`
for the detailed history and what each task shipped.

Still unbuilt: the explain card, the profile screen, and real token verification
against `/me` (any non-empty string is currently accepted as connected).

---

Not affiliated with any government agency.
