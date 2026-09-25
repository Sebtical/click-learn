# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No build step, no package manager, no tests. It's a static site (plain HTML/CSS/JS loaded via `<script>` tags in `public/index.html`, no modules, no bundler) served by one Cloudflare Worker that also proxies calls to Anthropic.

- **Run (full stack, with the proxy)**: `npx wrangler dev` — serves `public/` (via the `ASSETS` binding declared in `wrangler.toml`) and the `/api/claude` proxy route from the same `worker.js`, reading secrets from a local `.dev.vars` file (`ANTHROPIC_API_KEY=...`, `ACCESS_CODE=...`, gitignored, never commit it). This is the only way to exercise any AI feature locally, since `public/js/api.js` calls the relative `/api/claude` route.
- **Run (UI only, no AI features)**: open `public/index.html` directly in a browser.
- **Lint/format**: none configured.

## Architecture

Cloudflare deploys this as a single Worker (`worker.js`, entry point declared in `wrangler.toml`), not the older Pages-Functions convention — Cloudflare merged Pages into Workers, so hosting is one `fetch` handler that either serves a static file from the `ASSETS` binding (backed by `public/`) or handles `/api/claude` itself. See the Proxy architecture note below for why that route exists.

Single-page app with no framework: `app.js` holds a global `state` object (loaded from/saved to `localStorage` via `storage.js`) and a `render()` dispatcher that swaps `#app`'s `innerHTML` between screen-rendering functions (`renderHome`, `renderSubjectProgram`, `renderCaptureLesson`, etc.). Each screen function renders HTML then wires up its own event listeners — there's no router or component tree, just direct DOM manipulation. Script load order in `public/index.html` matters since everything shares the global scope (no ES modules).

**Two parallel quiz sources**, both converging on the same question shape and the same quiz-taking UI (`quiz.js`):

- **Local generators** (Maths, Français — `isLocalSubject()` in `localquiz.js`): each subject has a `THEMES_*` array (chapter metadata + a written `cours` text) and a matching `G_*` object mapping theme id → array of generator functions `hard => questionObject`. `localquiz.js` picks a random generator from the relevant pool and calls it. Generators build questions with the shared helpers in `quizkit.js` (`qcm`, `numQ`, `courtQ`, `qcmMulti`), which also handles shuffling choices and normalizing free-text answers. Geometry questions embed an inline SVG figure (`figures-maths.js`) via the question's `fig` field. No API call is involved — everything is procedural.
- **AI-generated quizzes** (all other subjects, plus optional "quiz from a lesson photo"): prompts live in `prompts.js` and are sent through `api.js`'s `callClaudeJSON`, which strips markdown fences and parses the JSON response. Every generation prompt asks the model for the *same* question JSON shape the local generators produce, which is why both paths render through the same `quiz.js` code unmodified.

**Proxy architecture**: the browser never holds an Anthropic API key. `api.js`'s `callClaude`/`callClaudeJSON` post to the relative route `/api/claude` with an `x-access-code` header, sending what the user typed into `state.accessCode` (set up once in `renderSetup`, persisted via `storage.js` like the rest of the state). `worker.js`'s `fetch` handler checks that header against the `ACCESS_CODE` secret (constant-time comparison via `constantTimeEqual`, to resist timing attacks on the passcode) before forwarding anything to `api.anthropic.com`, injecting `ANTHROPIC_API_KEY` — both secrets live in the Worker's Cloudflare settings, never in the repo. This means the access-code check gates the endpoint itself, not just the UI: hitting `/api/claude` directly without the header returns 401 before any Anthropic call happens. Anything that isn't `/api/claude` falls through to `env.ASSETS.fetch(request)`, serving the matching file from `public/`. `resizeImageToBase64`/`imageContentBlock` (client-side image downscaling before upload) are unaffected by any of this — same-origin request, same JSON body shape, just a different auth header and destination.

**Question types** (`type` field, handled in `quiz.js`'s `renderQuizQuestion`): `qcm` (single choice), `qcm-multi` (multi-select), `num` (numeric, tolerance-based comparison), `court` (short text, compared after accent/case/whitespace normalization), and an open-ended fallback graded live by calling Claude (`gradingPrompt`) since it needs free-form judgment.

**AI feature flow** (photo capture — `app.js`):
1. `resizeImageToBase64()` in `api.js` downscales the photo client-side before sending it (phone photos are large).
2. The image + a task-specific system prompt from `prompts.js` go to `callClaudeJSON`.
3. Two photo-driven flows: analyzing a lesson photo into a saved `lesson` (title/summary/notions) that can later generate a quiz, and grading an already-completed exercise photo directly into per-question feedback.
4. Per-subject curriculum (chapter list for non-local subjects) is also AI-generated once per subject and cached in `state.curriculum[subject]`.

**Progress tracking**: every answered question appends an `attempt` record (`subject`, `theme`/notion, `correct`, timestamp) to `state.attempts` via `recordAttempt()` in `quiz.js`. `chapterMasteryPct()` in `app.js` aggregates these per subject+theme to show mastery badges, and `parent.js` (behind a 4-digit PIN stored in `state.parentAuth.code`) surfaces this to a parent.

**State shape** is defined by `DEFAULT_STATE` in `storage.js` — `profile`, `accessCode`, `subjects`, `lessons`, `quizzes`, `attempts`, `progress`, `curriculum`, `parentAuth`. `loadState()` merges saved state onto these defaults, so adding a new field there is enough to migrate existing users without a migration script (and explicitly strips the retired `apiKey` field left over from before the proxy — see the Security note below).

**Security note**: `state.accessCode` (stored in `localStorage` like the rest of the state) is a low-stakes app-entry passcode, not a secret worth protecting to the same standard as an API key — it's meant to be long enough to resist brute force (see `worker.js`'s rejection path) but it's still visible to anyone with access to the device. The real secrets (`ANTHROPIC_API_KEY`, `ACCESS_CODE`'s reference value) only exist as Cloudflare Worker secrets and are never bundled into anything served to the browser.

## Status

First working version (commit `d61eca7`): local Maths/Français quizzes, AI-generated quizzes from lesson photos or curriculum, exercise photo grading, and a parent space. Hosted on Cloudflare Workers (static assets + proxy in one Worker, see Architecture above) so it can be used from any device, not just the machine that set the API key. No automated tests or CI yet.
