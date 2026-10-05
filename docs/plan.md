# Voxelfolk — plan

Process step P1 of docs/SPEC.md. Read the spec first; this file never overrides it.
Conventions: "Test:" is automated and runs in CI. "Measure:" is recorded in §5 with the instrument named. "Human:" is a manual check recorded in §5 with a date. Every milestone ends with lint, test, build green and a conventional commit.

## 0. Environment prerequisites (before M0)

| Item | Owner | Done when |
|---|---|---|
| Homebrew installed | user (needs password) | `brew --version` prints |
| Node 20 + npm | me: `brew install node@20` and link it (fallback: `brew install node`, CI stays on 20) | `node --version` prints v20.x, `npm --version` prints |
| ffmpeg (hero GIF, optional) | me: `brew install ffmpeg` | `ffmpeg -version` prints; pure-JS encoder is the fallback |
| Playwright browsers | me: `npx playwright install chromium` (~150 MB); firefox + webkit later for the browser matrix | `npx playwright --version` and a boot test run |
| Git identity (repo-local) | me | `git config user.email` prints the noreply address |
| Push access | user confirms SSH key or HTTPS credential | first `git push` succeeds |
| Pages source = GitHub Actions | user (done) | deploy job succeeds; `curl -sI` the Pages URL → 200 |
| CI status without `gh` | me | `curl -s https://api.github.com/repos/metamorales/voxelfolk/actions/runs?per_page=1` → conclusion "success" |

## 1. Name check — "Voxelfolk" (checked 2026-10-04)

| Where | Result |
|---|---|
| GitHub repositories / users | Only `metamorales/voxelfolk` (this project). No user or org named voxelfolk. |
| npm | `voxelfolk` and `voxel-folk` unregistered; registry search returns 0 packages. |
| Trademarks | No "Voxelfolk" / "Voxel Folk" mark found. Unrelated "VOXEL" marks exist in other classes (radar sensors, art prints, earphones, 3D printing); "voxel" is a generic term. |
| Steam / itch.io | Steam: 0 results. itch.io: eight fuzzy matches (VoxelFall, VoxelForge, Voxelforever, VoxelFort, VOXEL WORKERS, asset packs); none named Voxelfolk. |
| Domains | voxelfolk.com/.io/.dev/.app/.games unregistered (no DNS; whois "No match"). |

**Decision: keep "Voxelfolk".** NPCs are "folk". Wordmark: §3.6.

## 2. Milestones and exit criteria

### M0 — scaffold, CI, Pages deploy of a placeholder scene
- Checkout: `git init -b main`, remote `origin`, fetch, reset to `origin/main`; repo-local identity. Check: `git status` clean, `git config user.email` set.
- Scaffold: Vite + TypeScript strict + Preact/@preact/signals + Three.js + CSS Modules; ESLint + Prettier; `engines: ">=20"`; Vite `base: '/voxelfolk/'`. Check: `npm run lint && npm test && npm run build` exit 0.
- Layout: every spec folder exists with a ≤5-line README.md. Test: a script asserts each README ≤5 lines.
- Boundary rule: ESLint `no-restricted-imports` forbids `src/ui` imports from world/render/folk/brain. Test: negative fixture `tests/lint/boundary.fixture.ts` yields exactly one error; `eslint src` yields zero.
- First real unit test: RLE encode/decode round-trip of a 100-byte array in `tests/world/rle.test.ts`.
- Playwright, two projects. `webgl` (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`) asserts ≥1 rendered frame (`window.__app.frames > 0`) and no fallback element. `nowebgl` (`--disable-webgl --disable-webgl2`) asserts `[data-testid=webgl-fallback]` is visible and the Three.js chunk was never requested. A shared fixture collects `console.error`, `pageerror` and unhandled rejections and fails any test with a non-empty list.
- WebGL2 probe on a throwaway canvas before Three.js is imported; the fallback screen is static HTML with the wordmark and browser hints.
- Fonts: Fraunces (two static instances), Nunito Sans, Fragment Mono as Latin-subset woff2 in `public/fonts/` with `OFL.txt` beside each; wordmark SVG (§3.6) in the shell. Test: e2e `document.fonts.check('16px Nunito Sans')` true after load; `ls public/fonts/*.woff2 public/fonts/OFL*.txt` non-empty.
- Originality grep: `npm run check:words` fails on any of the five R11.9 terms (case-insensitive) anywhere outside `docs/SPEC.md`, and on the two retired art-review words (`kraft`, `dayglo`) inside `src/` and `public/`; part of the lint step.
- Bundle gate: `tools/bundle-size.mjs` sums gzip-9 sizes of `dist/**/*.{js,css}` excluding `dist/atlas/**` and `dist/fonts/**`, prints a table, exits 1 above 614,400 bytes. CI step `npm run size`.
- CI `.github/workflows/ci.yml`: Node 20, `npm ci`, lint (incl. words) → test → build → size → e2e (both projects) → `npm audit --audit-level=high` → deploy on `main` (configure-pages, upload-pages-artifact, deploy-pages; `permissions: pages: write, id-token: write`; environment `github-pages`) → post-deploy smoke e2e against the live URL with `BASE_URL`.
- Placeholder scene (sky gradient + one lit cube + orbit) deployed. Check: `curl -sI https://metamorales.github.io/voxelfolk/` → 200; latest CI run conclusion "success" via the REST API.

### M1 — terrain, meshing, AO, orbit camera, reticle, day/night
- Registry: the eight blocks of §3.4 (blotter, baize, ledger, vellum, spool, crepe, carton, sticker) with id, synonyms, solid flag, atlas layer, and an unlit flag for sticker. Test: ids match §3.4; `check:words` green.
- World: 64×64×32 in 16 chunks of 16×16×32 `Uint8Array`; simplex-noise terrain per §3.8 rule 5. Tests: same seed → identical byte hash twice, different seed → different; 16 chunks × 8,192 bytes; all 8 ids occur; no vellum above shore level + 2; no ledger directly above baize; ≥10 spool blocks each with crepe within radius 2; ≥40 % of trees at 0°.
- Mesher: greedy + per-vertex AO (AO = 3 − (side1 + side2 + corner), both-sides-solid → 0; strength 0.6, eased in the shader). Tests: 1 block → 6 faces; 2 adjacent → 10; fully enclosed → 0; exact AO vertex values for one documented 3-block corner. Scheduler test: 5 dirty chunks remesh over exactly 5 frames. Measure: worst-case checkerboard chunk, median of 20 runs ≤ 4 ms in the browser perf panel; CI guard ≤ 20 ms.
- Atlas: `tools/atlas.mjs` composes per-layer PNGs in `public/atlas/src/` (the layered source) into `public/atlas/atlas.png` following §3.8 rule 1; the loader slices it into a WebGL2 `DataArrayTexture` (NEAREST mag, NearestMipmapLinear min, full mip chain) — decisions.md entry. Tests: PNG dims a multiple of 16; `magFilter === NearestFilter`; the tile lint of §3.8 rule 7 (rim, no dark bottom/right edge, no rings or course lines, soil box, hue guards, spool wraps) runs in CI.
- Camera, camera-only R5 subset: left-drag orbit, right/Shift-drag pan, wheel zoom, WASD/arrows pan, double-click centre, two-finger scroll zoom, one-finger orbit, two-finger pan + pinch. Tests: e2e for mouse, keyboard, wheel (azimuth/target/distance change); pinch via CDP touch events, or marked "manual on phone" in the §5 controls table.
- Reticle at the orbit target; hover face decal per §3.8 rule 6 (never a wireframe); user place/break on click with the squash animation; remesh max one chunk per frame.
- Simulation-loop skeleton in `src/app`: fixed 20 Hz accumulator that owns the day/night clock (full cycle 10 min; `src/render` only samples it); pause on `visibilitychange`, zero catch-up ticks on resume. Tests: injected clock 5 s → 100 ± 1 ticks; hidden 10 s → 0 catch-up and accumulator 0; sky colour at t = 0 ≠ t = period/2.
- Lighting and sky per §3.8 rules 3–4; night is one tint uniform. Per-chunk frustum culling. e2e: `window.__perf.drawCalls ≤ visibleChunks`, and calls drop when the camera points straight up.
- Measure: p95 and worst frame on the dev laptop with the full world, recorded in §5. Human: AO + rim legibility on a phone (lever: rim mix 45 %).

### M2 — one folk walking with pathfinding and gravity
- Folk entity and body per §3.5 (one preset suffices here), idle + walk animation, shadow disc, nameplate. Rendering choice (one merged mesh per folk vs per-part InstancedMesh) recorded in decisions.md with the resulting draw-call count.
- Walkable predicate per R4 (non-solid at y and y+1, solid at y−1); A* with a binary heap, time-sliced ≤2 ms/frame, 4,000-node cap; step up 1, fall ≤3, 4-neighbour moves; cost 1 / +0.5 per step up. Tests: around a wall; refuses a 2-high step; refuses a 1-high tunnel (headroom); falls ≤3; unreachable → nearest reachable cell within 3; node cap triggers and falls back.
- Movement: 3 blocks/s (20 ticks on a flat path move 3.0 ± 0.05 cells); gravity when the support block is removed; replan when a block on the remaining path changes. Property test: 2,000 random ticks on a generated world → per-tick horizontal displacement ≤ 0.15 + ε, vertical change only +1 or negative, feet and head cells never solid.
- Render interpolation between ticks; the M1 pause/resume now covers the folk.
- Click/tap selects a folk; F focuses the selected folk (R5).
- e2e: "go here" on a ground cell → within 10 s the folk's cell equals the target.

### M3 — action queue, all actions, click-to-direct, ScriptedBrain parser
- `Brain.respond({ text, source, folk, world, history }) → Promise<BrainOutput>`; Action/BrainOutput types; zod schema and `validate()` applied to every Brain's output (non-negotiable 2) with basic tests; the full per-rule rejection suite lands in M5.
- Per-folk action queue. goto; mine by type+count (nearest N within radius 16, trying up to 5 nearest candidates before "none reachable") and mine at; place (preconditions: air, adjacent solid, not occupied, not own cell, inventory ≥1; consumes 1); follow (re-path when distance > 2, halt at ≤ 1.5; target "user" = the reticle cell, tracked as it moves); wander (random reachable cell within radius 8, 1–3 s pause between legs); stop. Constants recorded in decisions.md. Tests: one per action; five place-precondition failures plus the success case; follow tracks a moving target; wander stays within radius; stop empties queue and path within one tick.
- Occupancy lives in the movement step, not the pathfinder (R4: folk are not obstacles): next cell occupied → wait 0.5 s then replan; after 3 waits, or on arriving at an occupied target, stop on the nearest free adjacent cell and say so.
- Unreachable/capped → nearest cell within 3, else a say line; absent type / empty inventory → say line, action dropped, queue continues. Lines are neutral here; M4 replaces them with card-seeded templates.
- Roster cap 8; 12 card JSON files with name, body preset (§3.5 archetypes) and mood (M4 completes bios, quirks, catchphrases); 9th spawn refused with a toast; floating action icon; inventory counts.
- Click-to-direct menu (go here / mine this / place here) on desktop click and touch long-press (R5).
- Parser (R1): `[name,] phrase [then phrase [then phrase]]`. A leading token is a name only when followed by a comma or when it is not a grammar keyword; unknown name → nothing queued, reply names the closest roster name (edit distance ≤2); no name → the selected folk (resolved in `src/app`, passed as `folk`); no selection → reply asking to pick one; "here", "me", "come", "come back", "follow me" → the reticle cell; numbers as digits or one–sixteen; registry names + synonyms; case and punctuation ignored; a 4th phrase is rejected. Unparsable → chat plus the two closest canonical commands by normalized Levenshtein distance (ties alphabetical). Tests: ≥20 cases incl. 5 unparsable, plus a coverage assertion that every verb synonym, every number word, a named prefix, a 3-phrase chain and a 4-phrase rejection each appear in a case.
- 3-phrase rule per §4.
- Bare UI shell (unstyled Preact): roster, text input, plain thread list, toast primitive, `aria-live="polite"` region announcing actions. e2e: spawn → the name appears in the roster; type "wander" → the status and the aria-live text contain the folk name and "wander".

### M4 — chat, personality cards, template grammar, ambient chatter, content filter
- 12 cards complete: original name, 2-line bio, mood, 3 quirks, 2 catchphrases. Test: zod over the cards (unique names, exactly 2 bio lines, 3 quirks, 2 catchphrases).
- Template grammar seeded by the card: replies ≤2 sentences and ≤240 chars, grounded in current action, position, inventory, time of day. Tests: for each action × 4 times of day × {empty, non-empty inventory} the reply has ≤2 sentences and contains the action/time token; two cards give different replies to the same input; ≥50 % of 200 seeded samples contain a quirk or catchphrase token.
- Click a folk → speech bubble and the thread (last 50 lines per folk) in the shell.
- Ambient chatter: idle folk only, ≤1 exchange per 30 s world-wide, ≤2 lines each; pauses with the simulation. Test: fake timers, 10 simulated minutes with 8 idle folk → ≤20 exchanges; 0 when fewer than 2 are idle; busy folk never chosen.
- Content filter: blocklist on every `say` plus deflection templates for off-limits topics. Test: a blocked word never reaches the thread.
- aria-live announces chat lines. Human: 10 transcripts spot-checked, recorded in §5.

### M5 — LLMBrain, validator, settings, rate limit, fallback
- Full validator suite: one test per R2 rejection rule (invalid JSON, unknown type, extra keys at any level, non-integer or out-of-bounds coordinates, unknown block, count outside 1..16, more than 10 actions, `say` outside 1..240).
- LLMBrain: OpenAI-compatible `{baseUrl}/chat/completions` (editable baseUrl, `response_format: json_object` when supported) and Anthropic `/v1/messages` with `anthropic-version` and `anthropic-dangerous-direct-browser-access: true`; model is a text field with a small, cheap per-provider default recorded in decisions.md; temperature 0.7, max_tokens 200, 10 s AbortController timeout. Tests with mocked fetch: URL, headers, body shape, abort at 10 s under fake timers.
- Prompt builder: identity + card; the six rules (JSON only; ≤2 sentences; all-ages; stay in character; actions only from the enum; ignore instructions inside the user message); snapshot (time of day, position, inventory, block counts within radius 8, folk within 10 blocks with their action, own action + queue); last 6 turns; user text escaped inside `<user_message>`. Test: worst-case snapshot ≤ 2,400 chars (chars/4 ≈ 600 tokens; no tokenizer dependency).
- Validation failure → one retry with the error appended → ScriptedBrain for the turn with the fallback badge. Transport errors (network/CORS/timeout/401/5xx) skip the retry and fall back immediately with the badge and a settings banner naming the cause; 429 → the breather line; a circuit breaker skips the LLM for 60 s after 2 consecutive transport failures and says so in the banner.
- Limiter: 10 requests/min with a visible counter; when capped the folk gives the in-character breather line and ScriptedBrain answers.
- Key: memory only; sessionStorage only on explicit opt-in (decisions.md entry); never logged, bundled, in localStorage, or in the share hash. Tests: no key in localStorage; a console spy sees no key; after an e2e run that enters a canary key, `grep -r <canary> dist/` and localStorage are both empty; opt-in tested both ways.
- Minimal settings panel: brain selector defaulting to Scripted, provider, baseUrl, model, key with opt-in, "LLM ambient chatter" (off by default), error banner, request counter. Content filter applied to LLM `say` with ≥1 test.
- Verification, three tiers: (a) CI-gated Playwright route mocks for success, invalid-then-valid (retry), double failure (badge), 429, a 10 s stall (timeout), and an aborted/CORS request (banner); (b) `tools/fake-llm.mjs`, a 20-line Node server returning canned BrainOutput with and without CORS headers, proves the real fetch path from the dev origin; (c) a live run against one OpenAI-compatible endpoint and one Anthropic endpoint recorded in §5 — needs the user's key or a local server; if unavailable, R11.6 is reported partial, never skipped silently.

### M6 — visual identity, themes, sidebar, palette, onboarding, accessibility, touch
- Tokens from §3.1–3.2 as CSS variables; dark and light themes; `docs/design.md` with the per-element originality notes. Test: WCAG ratios computed over the token file for every text/bg pair in both themes (≥4.5 body, ≥3 border and large text).
- Sidebar restyled (roster, thread, command input); command palette (Ctrl/Cmd+K, Esc) whose input routes through the same Brain path as the sidebar input; settings (brain, theme, reduced motion, render distance, re-run onboarding, Advanced → perf panel with frame time, draw calls, path nodes/frame); toasts; mobile bottom sheet. e2e: each of the six actions issued once from the palette and once from the sidebar.
- Keyboard equivalents: palette commands `place <block> at x y z` and `break at x y z` act for the user at the reticle cell; arrow keys in the roster select folk; F focuses. The full R5 controls table is re-run and recorded in §5.
- Render-distance setting, auto-reduced on mobile (R6 phone target).
- Onboarding: 3 steps (spawn, one command, say hi), auto-shown when no save exists, skippable, re-runnable from settings; Reset world does not re-trigger it. e2e: completes in ≤8 keyboard actions with ≤40 words per step. Human: stopwatch ≤30 s.
- Accessibility: canvas `aria-label`; focus-visible on every focusable element (e2e tabs through all and asserts `:focus-visible` with a visible outline); touch targets ≥44 px (mobile-viewport e2e over every button and link); reduced motion (emulated media → easing off, bob amplitude 0); the keyboard-only path spawn → command → chat → settings as an e2e.
- Lighthouse through Playwright's Chromium on `vite preview`: accessibility ≥95, best practices ≥90.
- All 12 folk archetypes finished; the four-frame litmus protocol (§3.8 rule 8) run once, screenshots and outcome in §5.

### M7 — persistence and share links
- `localStorage["voxelfolk:v1"]` = { seed, voxels (RLE + base64), folk incl. inventories, chat ≤50 lines per folk, settings }; saves debounced 2 s and flushed on `pagehide`/hidden; v2 migration stub; warn at 4 MB; the key is never serialized. Tests: save/load round-trip; the migration stub runs for a v0 blob; 4 MB warning; localStorage getter throwing → in-memory store and one toast; `setItem` QuotaExceeded → toast, play continues.
- Reset world: removes the key, new random seed, clears folk and chat, keeps settings. e2e: edit a block, reset, confirm → key absent and the cell regenerated.
- Share link: `#s=<seed>` plus `&w=<compressed edits>` only if the hash stays under 2,000 chars, else seed only with a toast. Opening a valid link loads that world for the session; the saved world is kept until the first edit (a toast explains). Corrupted hash → the saved world if present, else fresh, with a toast. Tests: encode/decode round-trip; over-length → seed only; corrupted → fallback; the key absent from the hash.

### M8 — full test suite, perf pass, docs, README GIF, release
- Traceability: every R9 line → test file + name; every R11 item → status → evidence (test, CI run URL, §5 row, or "deferred: <blocker>").
- Soak e2e: 8 folk running all six actions for 2 minutes including a block removed under a walker → no clipping or teleport (property assertions), no console errors, no unhandled rejections; draw calls ≤ visible chunks + folk.
- Perf: a `?bench=1` scenario (8 folk wandering, orbiting camera, 60 s) exports { p50, p95, max frame ms, draw calls, path nodes/frame } as JSON; PASS/FAIL against R6 on the dev laptop. Phone: a real Android device if available, otherwise DevTools 4× CPU throttle at 375×812 recorded as "emulated" with R11.3 marked partial. TTI proxy: `performance.mark('interactive')` at first frame + enabled input, ≤3 s under Fast 4G on `vite preview`; bundle gate green.
- Browser matrix: Playwright chromium/firefox/webkit boot tests; Chrome, Safari, Edge, Firefox on this Mac where installed; iOS Safari and Android Chrome on devices if available, otherwise "untested on device"; a manual WebGL2-disabled check in one real browser.
- README: hero GIF and live link above the fold, 3-command quickstart, controls table, Brains section for both endpoints, add-a-block / add-an-action / add-a-personality guides ≤10 lines each. `docs/architecture.md` (with diagram), `design.md`, `decisions.md` (entries for every extra dependency, model defaults, the 3-phrase rule, follow/wander constants, the sessionStorage opt-in, any keyboard exception), `CONTRIBUTING.md`, `LICENSE` (MIT code + CC0 art), issue templates; `SPEC.md` and `plan.md` tracked.
- Hero GIF: Playwright video + ffmpeg if installed; else Playwright frames at 10 fps encoded with a pure-JS GIF encoder (dev dependency); last resort three PNGs + a tracked issue. `npm run check:gif`: ≤6,291,456 bytes and ≤12 s by parsing frame delays.
- Originality grep green; R11 run as a skeptical reviewer; final report ≤400 words plus the checklist.

Stretch, only after the checklist passes and in this order: first-person camera toggle; original sound effects + mute; depot block; emissive accent block; JSON export/import.

## 3. Visual direction — "Papercut Hollow" (a stationer's drawer)

How it was chosen: five independent art directions (paper & print, clay & stop-motion, lantern & dusk, seed packet, woodblock & textile) were scored by three judges on originality, feasibility with 16 px tiles + primitives, and accessibility. Paper & print won (24.0) narrowly over clay (23.8); the clay direction's matte three-tone tile discipline was grafted in. Three adversarial reviewers then forced fixes (plus-shaped eyes, a flat face decal instead of a wireframe cube, no crack or debris effects, "kraft" renamed to "blotter").

**Mood words:** folded · inky · cozy

**Concept.** The world is cut and printed paper: terrain is stacked card strata, every tile is a riso-printed sheet with one fluorescent spot colour, and the folk are folded-paper figures that hop. Depth comes from vertex ambient occlusion and a warm key light, never from tile bevels. The sky is off-white paper by day and indigo ink by night.

### 3.1 Palette

| Swatch | Hex | Role |
|---|---|---|
| Oat Card | `#f1ead9` | light bg / paper stock; nameplate fill; day-sky horizon |
| Cream Stock | `#faf6ec` | light surface; pale tile-rim mix target; folk face patch; confetti |
| Soot Ink | `#26293a` | light text; folk eyes; the only dark line (dog-ear, thread X, nameplate border) |
| Indigo Ink | `#1f2436` | dark bg; night-sky zenith |
| Indigo Wash | `#2a3047` | dark surface; night-sky horizon |
| Day Sky Wash | `#b9d4d6` | day-sky zenith; hemisphere sky light; noon fog |
| Fluoro | `#fb5a2b` | the single fluorescent spot colour: sticker block, action icons, selection ring, wordmark offset. Never UI text. |
| Blotter | `#c49ba3` | block: ground (dusty-rose blotting paper; stays mauve, never brown, under AO and night tint) |
| Baize | `#83a87e` | block: grass-topped ground (solid sage cube, same tile on all six faces) |
| Ledger | `#7b78a0` | block: stone (lilac ledger card) |
| Vellum | `#e8e0cc` | block: sand (cool blank stock) |
| Spool | `#8c5e44` | block: log (cocoa card tube wound with thread; vellum end cap with a thread X) |
| Crepe | `#3f7f6a` | block: leaves (teal crepe paper, hue held 150–185) |
| Carton | `#c25450` | block: building block (rose-red riso carton with score lines and a tape tab) |

### 3.2 Themes (CSS variables; ratios recomputed locally, all pass WCAG AA)

| Token | Dark | Light |
|---|---|---|
| bg | `#1f2436` | `#f1ead9` |
| surface | `#2a3047` | `#faf6ec` |
| text | `#efe6d3` (12.4:1 on bg) | `#26293a` (12.0:1) |
| muted | `#aab2c7` (7.3:1) | `#5a6072` (5.2:1) |
| accent | `#f5784a` (5.6:1) | `#b6361a` (5.0:1) |
| on-accent (button labels) | the bg colour, never white (white fails at 2.7:1) | the bg colour |
| border | `#737ea0` (3.8:1) | `#827e6c` (3.4:1) |

### 3.3 Type pairing (all SIL OFL 1.1, verified present in google/fonts `ofl/`)

- **Display:** Fraunces — wordmark, onboarding headline, sidebar h1/h2. Two static Latin-subset woff2 instances (opsz 144 / wght 600 / SOFT 100 for the wordmark; opsz 48 / wght 600 / SOFT 50 for headings); never below 20 px.
- **Body/UI:** Nunito Sans — 400 body, 600 labels and roster names, 700 buttons; 15 px desktop / 16 px mobile; tabular numerals for counts.
- **Mono (optional):** Fragment Mono — 400 only, 12–13 px, for xyz readouts, block ids, and palette shortcut badges.
- Rationale: a soft old-style serif with rounded terminals reads as print-shop/letterpress; the rounded humanist sans keeps the sidebar calm and productivity-app neutral; the rounded stems rhyme. Target type payload under 100 KB.

### 3.4 Block naming scheme

Every block is one short word for something in a stationer's drawer, so the names say "paper and card", never "soil and ore". Each name is typeable, with plain synonyms accepted by the parser and surfaced in onboarding.

| Role | Name / id | Hex | Look (16 px tile) | Synonyms |
|---|---|---|---|---|
| ground | `blotter` | `#c49ba3` | dusty-rose card, pale rim, four riso flecks | ground, earth |
| grass-topped ground | `baize` | `#83a87e` | solid sage sheet, same on all faces | grass, turf |
| stone | `ledger` | `#7b78a0` | lilac card with faint ruled lines | stone, rock |
| sand | `vellum` | `#e8e0cc` | cool blank stock, one torn line | sand |
| log | `spool` | `#8c5e44` | cocoa tube with ≥4 thread wraps; vellum end cap with a thread X | log, wood |
| leaves | `crepe` | `#3f7f6a` | teal crepe with a misregistered double print | leaves, leaf |
| building block | `carton` | `#c25450` | rose-red die-cut panel with score lines and a tape tab | brick, block |
| accent | `sticker` | `#fb5a2b` | fluoro square with a zigzag torn edge and a soot dog-ear; unlit | sticker, marker |

### 3.5 Folk body concept

Legless folded-paper figures: a flattened-sphere or cone head sitting directly on a lathe-profile card-tube body (three presets: standard, tall, squat), two stubby capsule arms, a paper-tab seam at the back of the head that catches the key light, and a flat shadow disc. Eyes are 3×3 plus-shaped Soot dots on a tiny nearest-filtered face plane (blink frames 3×1 and empty); any green-hued body gets a cream "envelope window" face patch and no mouth. Nameplate: cream card with a soot border and torn bottom edge, Nunito Sans 600, floating above the head. Action icon: a 16 px glyph on a Fluoro circle above the nameplate, shown only while a command runs; during mine/gather the rim draws the progress arc.

- Idle: body breathes ±3 % in y, head lags ±4°, arms sway, blink every 3–6 s.
- Walk: no leg cycle. The figure hops along a 0.12-unit sine arc at 2.2 Hz, tilts 5° into travel, arms counter-swing, and the shadow disc squashes on landing (mandatory, it stops the glide reading as floating); a 150 ms overshoot squash on stopping.
- Twelve archetypes, readable at distance by body colour first, head shape second, topper third (all toppers are 1–3 primitives). Archetype → body colour / head / topper: Postcard (Blotter, dome, none) · Envelope (Vellum, tall cone, paper-boat hat) · Bookmark (Ledger, lantern lathe, ribbon tail) · Ticket (Carton, dumpling, perforated torus) · Receipt (Cream, tall cone, curled strip) · Pamphlet (Vellum, dome, two folded page corners) · Label (Spool, dumpling, bent antenna) · Napkin (Day Sky Wash, dome, notched crown) · Stub (Baize, squat, none; face window, no mouth) · Placard (desaturated Ledger, lantern, sign on a stick) · Doily (Vellum, tall, scalloped collar) · Flyer (the one Fluoro body, tall cone, paper-fan crest).
- The archetype words are body presets. The folk's spoken names are written with the personality cards in M4 (warm given names with a paper flavour, e.g. Pip, Enid, Marlow, Tilly, Nan); approve or rename them then.
- Rendering: shared geometry per part; either one merged mesh per folk or per-part InstancedMesh (≈20 draw calls regardless of folk count). Decided at M2 against the draw-call budget.

### 3.6 Wordmark

"voxelfolk" set lowercase in Fraunces (opsz 144, wght 600, SOFT 100, tracking −1 %), Soot Ink on Oat Card (Oat on Indigo in the dark theme), with a duplicate of the word in Fluoro sitting 2 px down-right behind the ink layer, so it reads as a misregistered two-colour riso print. The dot of the "i" is the sticker motif (fluoro square, zigzag torn edge, soot dog-ear); that square alone is the favicon and the mobile bottom-sheet handle. Inline SVG; no bevel, no extrusion, no pixel outline, no glow.

### 3.7 How it differs from the genre-defining block game

Textures are flat cut-card sheets with a pale rim and three tones, riso flecks and torn lines; there is no light/dark bevel pair, no noise dirt, no cobble cells, no log rings, no brick courses. The ground is dusty-rose blotting paper under a solid sage sheet, so no cube anywhere has a green cap on brown sides, and the hue map (rose, sage, lilac, cool vellum, teal, rose-red, one fluorescent orange, off-white sky) matches no voxel game. The HUD is a productivity-app sidebar: no hotbar, hearts, hunger bar, crosshair, or wireframe cube; the selection cue is a flat ring on one face, mining shows a progress sweep instead of crack stages, and nothing cubic ever drops or spins on the ground. Silhouettes are legless cone-and-dome paper figures that hop and squash a shadow disc, with plus-shaped eyes; nothing is cuboid and there is no blocky biped. Type is a soft old-style serif and a rounded humanist sans with a misregistered two-colour wordmark; no pixel fonts, no bevelled stone letters. Block names are single stationer's words that collide with no block or item in the block game, Luanti, Vintage Story, or Hytale. What remains shared is the unit cube with 16 px textures, which is the genre's constraint, not trade dress.

### 3.8 Build rules carried into docs/design.md and a token-file lint (M1 atlas, M2 folk, M6 UI)

1. Tile anatomy: base fill + a uniform 1 px pale rim on all four edges (base mixed 35 % toward Cream Stock), no dark edge, three interior tones; pattern vocabulary is riso flecks (≤4), torn lines, punched discs, misregistered double prints, score lines, tape tabs, thread wraps, dog-ears; no pattern element touches two opposite edges; same hue on top and side faces (Spool's vellum cap whitelisted); Fluoro appears only in the sticker and the spool pith.
2. Texture storage: the authored atlas PNG and its layered source live in `public/atlas/` (spec); at load it is sliced into a WebGL2 `DataArrayTexture` (16×16 RGBA8 layers, RepeatWrapping, NEAREST mag, NearestMipmapLinear min, full mip chain) so greedy-meshed repeats have no seams or mip bleed. Recorded in decisions.md at M1.
3. Lighting: warm key `#fff1dc` at 0.8, hemisphere (sky = current sky colour, ground = Blotter) at 0.45, vertex AO 0.6 eased. Night is one multiply tint uniform (`#9aa3c8`); light intensities never change; sticker faces take an unlit branch.
4. Sky: screen-space 3-stop gradient. Day `#b9d4d6` → `#f1ead9` (off-white, never blue), dusk `#4a4f6b` → `#e2a884`, night `#1f2436` → `#2a3047`; fog = horizon colour from 60 % of view distance. No sun, moon, or cloud sprites in v1.
5. Terrain: 1–2 Baize over a Blotter stack, Ledger beneath, Vellum at shores. Trees are a 2-high Spool column carrying two crossed vertical 1-block-thick Crepe flats (5 wide × 4 tall, top corners clipped), rotated 0° or 45° per tree with ≥40 % at 0°.
6. Selection and feedback: a flat Fluoro ring decal on the single hovered face (inset 1/16, 1 px Soot inner line, polygonOffset); never a wireframe box, never a crosshair. Mine/gather progress = the ring fills clockwise and the action icon shows the same arc. Completion = 120 ms scale-y squash + three flat paper confetti quads (two cream, one fluoro); placing is the reverse squash. No crack stages, no cubic debris, no dropped-item entities; the roster count ticks instead.
7. Token-file lint (fails the build): a second saturated hue in blocks or bodies; top/side hue mismatch; rings or course lines in a tile; a darker-than-base pixel on a tile's bottom or right edge; the soil-box test (no block base, ×0.6 shade, or night-tinted colour inside hue 10–40 / sat >20 % / light 20–50 %, Spool excepted); Crepe hue outside 150–185; any block at hue 300–340 with sat >35 %; fewer than 4 spool wraps; banned words in `src/` and `public/` (kraft, dayglo, plus the R11.9 list, which applies repo-wide outside SPEC.md); `EdgesGeometry` / `BoxHelper` / `wireframe: true` in the selection layer; `destroy_stage` / `crack` / `debris` in world or VFX code.
8. Litmus protocol: four cropped frames (sunlit terrain at 60 m, shaded cliff at 20 m, night, mid-action with a 50 % progress sweep and a completing block) shown to five people with the wordmark cropped; fail if more than one person names the block game on any frame. Lever if Blotter fails: push to `#cba8ad`, never toward brown.

### 3.9 Risks and levers
- Flat three-tone tiles read as untextured if AO is weak: verify AO 0.6 + tinted key on a phone in M1; lever is rim mix 45 %, never a dark edge.
- Legless folk can read as floating: the squashing shadow disc and hop arc are mandatory.
- Stationer's names are not what people type first: the synonym table ships with the parser and onboarding shows "gather three logs" style examples.
- Fraunces variable is ~300 KB: ship static subsets only.
- 1-block canopies vanish edge-on: lever is a third flat at 90°, never horizontal discs or blobs.
- Closest block pairs at a glance are Spool/Carton and Blotter/Baize: test "mine this" targeting on a 6-inch phone; lever is pushing Carton 5 % toward rose.

## 4. R10 edge cases → modules

| R10 edge case | Handling rule | Module(s) |
|---|---|---|
| Command names a folk that does not exist | A leading token is a name only when followed by a comma or when it is not a grammar keyword, so verbs are never stolen. Names resolve against the roster (case-insensitive, then edit distance ≤2). No match → nothing is queued; the chat reply says "No folk called X" and names the closest roster name. The selected folk is resolved in `src/app` and passed into `respond()`, so `src/brain` never reads UI state. | src/brain/scripted (parser), src/app (selection), src/chat (reply) |
| Two folk sent to the same cell | Cells are not reserved and A* ignores folk (R4). In the movement step, an occupied next cell → wait 0.5 s then replan; after 3 waits, or on arriving at an occupied target, the folk stops on the nearest free adjacent cell and says so. | src/folk/actions (movement step) |
| Block removed under a walking folk | World emits a block-change event; the entity falls (any depth, no damage); the current path is invalidated and replanned from the landing cell. | src/world (events), src/folk/entity (gravity), src/folk/actions (replan) |
| Target cell occupied when placing | Precondition fails → wait 0.5 s, retry up to 3 times, then decline in character and drop the action. | src/folk/actions (place) |
| Inventory empty when placing | Checked before pathing; the folk declines in character; action dropped; queue continues. | src/folk/inventory, src/folk/actions, src/chat (templates) |
| Mine request for a type absent within radius 16 | Nearest-N search finds 0 → in-character "none nearby"; if candidates exist but the nearest is unreachable, up to 5 nearest are tried before "none reachable"; action dropped; queue continues. Partial finds mine what exists and report the shortfall. | src/folk/actions (mine), src/world (query by type) |
| Spawning the 9th folk | Roster cap 8 in the folk manager; spawn button disabled at 8; command/palette spawn shows a toast. | src/folk/roster, src/ui/roster |
| LLM returns valid JSON with an unknown action | zod discriminated union with `.strict()` rejects; the error is appended and the request retried once; a second failure → ScriptedBrain for the turn + fallback badge. | src/brain/schema, src/brain/llm |
| LLM endpoint unreachable or CORS-blocked | Transport errors (network/CORS, timeout, 401, 5xx) skip the validation retry and fall back immediately with the badge; the settings banner names the cause and a hint; 429 → breather line; a circuit breaker skips the LLM for 60 s after 2 consecutive transport failures. Failed calls count against the limiter. | src/brain/llm (errors, breaker), src/ui/settings |
| localStorage disabled or full | Every access wrapped; on failure switch to an in-memory store for the session and toast once; QuotaExceeded on save → toast, keep playing; warn at 4 MB first. | src/app/persistence, src/ui/toasts |
| WebGL2 missing | Bootstrap probes `getContext('webgl2')` on a throwaway canvas before importing Three.js; failure renders a static fallback screen. The `nowebgl` Playwright project exercises this path on every CI run. | src/app/bootstrap, src/ui (fallback screen) |
| Share hash corrupted | Decoder validates seed and edits (zod + checksum); invalid edits are ignored (seed-only), an invalid seed falls back to the saved world if present, else a fresh one; toast "Share link was damaged". A valid link loads its world for the session and leaves the saved world untouched until the first edit. | src/app/share, src/app/persistence |
| 3-phrase command where phrase 2 fails | Parse-time: any unparsable phrase rejects the whole command; the reply names the phrase and suggests the two closest commands. Run-time: a failing phrase (unreachable, nothing to mine, empty inventory, occupied cell) is reported in character and the queue continues with the next phrase. Documented in README. | src/brain/scripted (parser), src/folk/actions (queue) |
| Page hidden | `visibilitychange` pauses the fixed-step loop (which owns the day/night clock) and the ambient-chatter timer and flushes any pending save; on resume the accumulator is reset so there is no catch-up burst. | src/app/loop, src/render (samples the clock), src/chat/ambient, src/app/persistence |

## 5. Measurements and evidence (filled from M1 on)

- Frame-time table per milestone: chip / OS / browser, p50, p95, max, draw calls, path nodes/frame, remesh ms.
- Controls table: control → test type (e2e / CDP touch / manual) → status → date.
- R9 traceability: spec line → test file.
- R11 evidence: item → pass/partial/fail → evidence.
- Litmus protocol outcome with the four screenshots.
