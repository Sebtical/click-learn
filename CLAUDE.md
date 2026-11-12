# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No build step, no package manager. It's a static site (plain HTML/CSS/JS loaded via `<script>` tags in `public/index.html`, no modules, no bundler) served by one Cloudflare Worker that also proxies calls to Anthropic and stores the child's results in a D1 database.

On this machine, PowerShell's execution policy blocks `npx.ps1`: use **`npx.cmd`** instead of `npx`.

- **Tests**: `node --test tests/worker.test.mjs tests/client.test.mjs` (Node 24+, no dependency: `node:test`, `node:sqlite`, `node:vm`). `worker.test.mjs` exercises the Worker routes against a real in-memory SQLite built from `migrations/`; `client.test.mjs` loads the real `public/js` scripts into a `vm` sandbox (same global-script model as the browser) and covers answer checking, sync and parent-space maths, plus 3,000 draws per question generator and difficulty. Write tests with any change.
- **Run (full stack)**: `npx.cmd wrangler dev` — serves `public/` (`ASSETS` binding), the `/api/*` routes and a local D1 copy, reading secrets from `.dev.vars` (`ANTHROPIC_API_KEY`, `ACCESS_CODE`, `PARENT_CODE_1`, `PARENT_CODE_2`; gitignored, never commit it). Apply the schema locally first: `npx.cmd wrangler d1 migrations apply click-learn --local`.
- **Database schema**: SQL files in `migrations/`, applied with `wrangler d1 migrations apply click-learn` (`--local`, then `--remote` before deploying code that needs them). The production database was created with `--jurisdiction eu` (data stays in the EU).
- **Run (UI only, no AI or sync)**: open `public/index.html` directly in a browser.
- **Lint/format**: none configured.

## Architecture

Cloudflare deploys this as a single Worker (`worker.js`, entry point declared in `wrangler.toml`), not the older Pages-Functions convention. One `fetch` handler routes `/api/moi`, `/api/sync`, `/api/parent/suivi` and `/api/claude`; everything else is served from the `ASSETS` binding (backed by `public/`). Deployment is continuous from GitHub `main`.

Single-page app with no framework: `app.js` holds a global `state` object (loaded from/saved to `localStorage` via `storage.js`) and a `render()` dispatcher that swaps `#app`'s `innerHTML` between screen-rendering functions. Each screen function renders HTML then wires up its own event listeners. Script load order in `public/index.html` matters since everything shares the global scope (no ES modules).

**Two parallel quiz sources**, both converging on the same question shape and the same quiz-taking UI (`quiz.js`):

- **Local generators** (Maths, Français — `isLocalSubject()` in `localquiz.js`): each subject has a `THEMES_*` array (chapter metadata + `cours` text) and a `G_*` object mapping theme id → generator functions `hard => questionObject`. `generateLocalQuiz` tags each question with its theme (so surprise quizzes count toward chapter mastery). Generators use the helpers in `quizkit.js` (`qcm`, `numQ`, `courtQ`, `fractionQ`, `qcmMulti`). Geometry questions embed an inline SVG figure (`figures-maths.js`) in `fig`. No API call.
- **AI-generated quizzes** (other subjects, plus "quiz from a lesson photo"): prompts in `prompts.js`, sent through `api.js`'s `callClaudeJSON`, which asks for the same question JSON shape.

**Answer checking** (`quizkit.js`, used by `quiz.js`): `estReponseNumJuste` reads numbers the way a French pupil types them (thousands spaces, comma, real minus sign `−`, trailing unit) and rejects anything else (`1/2` is not 0.5). Local `num` questions carry `exacte: true` (strict equality, their answers are exact decimals); AI ones are compared to the nearest hundredth. `fractionQ` questions accept any equal fraction (cross-multiplication in `comparerFraction`) and tell the pupil to simplify when needed. Only the first attempt at a question is recorded.

**Question types** (`type` field): `qcm`, `qcm-multi`, `num`, `court` (normalized text, or fraction equivalence when `fraction` is set), and an open-ended fallback graded by Claude (`gradingPrompt`).

**Roles and access**: the browser never holds the API key; every `/api/*` call sends `state.accessCode` in `x-access-code`. `worker.js`'s `roleDepuisCode` compares it (constant time) with three Worker secrets: `ACCESS_CODE` → `enfant`, `PARENT_CODE_1` → `parent1`, `PARENT_CODE_2` → `parent2`; a missing secret never matches. All three roles may use the `/api/claude` proxy, which rebuilds the request server-side (model forced, `max_tokens` capped, unknown fields dropped). `/api/moi` returns the role (no paid call; used at setup and on startup). The client stores `state.role` for display only (e.g. the parent-space link); the server is the only judge.

**Sharing results** (`sync.js`, `/api/sync`, `/api/parent/suivi`): only the child's device sends data. Each attempt stores the statement, the answer given and the correct answer (same text the pupil saw, via `fmtNum`). `synchroniser()` posts unsent attempts and lesson summaries (never photos) in batches of 200; it is silent on failure and retried on the next answer or startup. The first time the child code is used, the child sees an information screen (`renderConfirmReprise`): results are shared from now on, and the child chooses only whether to share the history already on the device (refused items are marked `synchro: 'local'`). On the server, `/api/sync` accepts the child role only, sets `joueur` from the role (never from the body), uses `INSERT OR IGNORE` on browser ids (no duplicates) and writes in one D1 batch. `/api/parent/suivi` accepts parent roles only and returns the child profile, the latest 5,000 attempts and the lesson count.

**Parent space** (`parent.js`): loads `/api/parent/suivi` and shows mastery per chapter, weak notions, the latest wrong answers (statement, answer given, correct answer) and recent quizzes. **Hard rule: every text coming from the database or from the AI goes through `echapperHtml` (`storage.js`) before being inserted with `innerHTML`.**

**Illustrations** (`habillage.js`): `ILLUSTRATIONS` maps a key (subject name, `banniere`, `trophee`, `photo`, `exercice`) to a WebP file in `public/img/` (3D Pixar-like, diverse children, generated by Seb, ~15 KB each); a `null` entry falls back to the emoji or mascot. `enTete()` builds sheet headers with the illustration on the right. A test checks every declared file exists. Never put a picture of the child there: `public/` is served without the access code.

**State shape**: `DEFAULT_STATE` in `storage.js` — `profile`, `accessCode`, `subjects`, `lessons`, `quizzes`, `attempts`, `progress`, `curriculum`, `role`, `reprise`. `loadState()` merges saved state onto these defaults (adding a field there migrates existing devices) and strips retired fields (`apiKey`, `parentAuth`). The child's personal avatar is NOT in `state`: it lives under its own key `clicklearn:avatar` (`lireAvatar`/`ecrireAvatar`), stays on the device and must never be synced, committed or put in `public/`.

**Security note**: `state.accessCode` is visible to anyone with the device; codes must be long (16+ characters). The real secrets (`ANTHROPIC_API_KEY` and the reference codes) only exist as Cloudflare Worker secrets. Cost per call is bounded server-side, but not the number of calls: keep a spending limit in the Anthropic console.

## Status

First version `d61eca7`; Cloudflare Worker proxy `9591578`. Branch `espace-famille`: server-side roles, D1 sync of the child's results, parent space read from the server, fixed answer checking and generators, tests. Next planned: family challenges (the child picks a chapter, one frozen quiz for the three players, scores compared).
