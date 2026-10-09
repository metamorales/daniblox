# Daniblox — plan

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
| CI status without `gh` | me | `curl -s https://api.github.com/repos/metamorales/daniblox/actions/runs?per_page=1` → conclusion "success" |

## 1. Name check — "Daniblox" (checked 2026-10-09)

| Where | Result |
|---|---|
| GitHub | No repository was named daniblox; this repo was renamed to `metamorales/daniblox` on 2026-10-09 (GitHub redirects the old URL). A user account "Daniblox" exists (created April 2026, no public repos) and does not block the repo name. |
| npm | `daniblox` and `dani-blox` both unregistered. |
| Trademarks | No Daniblox mark found. Noted risk: Roblox Corporation bars "Blox" in titles on its own platform, opposed BLOXEEZ at the trademark board in 2019, and sued the Bloxflip site, which also used Robux branding. Many unrelated "Blox" games ship on Steam. Judged low risk for a free MIT project that does not resemble Roblox; the owner accepted it on 2026-10-09. |
| Steam / itch.io | No match for daniblox. |
| Domains | daniblox.com/.io/.dev/.app unregistered (no DNS; whois "No match"). |

**Decision: Daniblox.** The characters are called **kits** in every user-facing string. The source folder stays `src/folk/` because the spec fixes the layout; only the wording changes. Wordmark: §3.6.


## 2. Milestones and exit criteria

### M0 — scaffold, CI, Pages deploy of a placeholder scene
- Checkout: `git init -b main`, remote `origin`, fetch, reset to `origin/main`; repo-local identity. Check: `git status` clean, `git config user.email` set.
- Scaffold: Vite + TypeScript strict + Preact/@preact/signals + Three.js + CSS Modules; ESLint + Prettier; `engines: ">=20"`; Vite `base: '/daniblox/'`. Check: `npm run lint && npm test && npm run build` exit 0.
- Layout: every spec folder exists with a ≤5-line README.md. Test: a script asserts each README ≤5 lines.
- Boundary rule: ESLint `no-restricted-imports` forbids `src/ui` imports from world/render/folk/brain. Test: negative fixture `tests/lint/boundary.fixture.ts` yields exactly one error; `eslint src` yields zero.
- First real unit test: RLE encode/decode round-trip of a 100-byte array in `tests/world/rle.test.ts`.
- Playwright, two projects. `webgl` (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`) asserts ≥1 rendered frame (`window.__app.frames > 0`) and no fallback element. `nowebgl` (`--disable-webgl --disable-webgl2`) asserts `[data-testid=webgl-fallback]` is visible and the Three.js chunk was never requested. A shared fixture collects `console.error`, `pageerror` and unhandled rejections and fails any test with a non-empty list.
- WebGL2 probe on a throwaway canvas before Three.js is imported; the fallback screen is static HTML with the wordmark and browser hints.
- Fonts: Press Start 2P and Pixelify Sans as Latin-subset woff2 in `public/fonts/` with `OFL.txt` beside each; wordmark SVG (§3.6) in the shell. Test: e2e `document.fonts.check('16px Pixelify Sans')` true after load; `ls public/fonts/*.woff2 public/fonts/OFL*.txt` non-empty.
- Originality grep: `npm run check:words` fails on any of the five R11.9 terms (case-insensitive) anywhere outside `docs/SPEC.md`, and on the imitation list (`pokemon`, `pikachu`, `nintendo`, `gamefreak`, `roblox`) inside `src/` and `public/`; part of the lint step.
- Bundle gate: `tools/bundle-size.mjs` sums gzip-9 sizes of `dist/**/*.{js,css}` excluding `dist/atlas/**` and `dist/fonts/**`, prints a table, exits 1 above 614,400 bytes. CI step `npm run size`.
- CI `.github/workflows/ci.yml`: Node 20, `npm ci`, lint (incl. words) → test → build → size → e2e (both projects) → `npm audit --audit-level=high` → deploy on `main` (configure-pages, upload-pages-artifact, deploy-pages; `permissions: pages: write, id-token: write`; environment `github-pages`) → post-deploy smoke e2e against the live URL with `BASE_URL`.
- Placeholder scene (sky gradient + one lit cube + orbit) deployed. Check: `curl -sI https://metamorales.github.io/daniblox/` → 200; latest CI run conclusion "success" via the REST API.

### M1 — terrain, meshing, AO, orbit camera, reticle, day/night
- Registry: the eight blocks of §3.4 (crumb, clover, pebble, shell, bark, sprout, tile, gem) with id, synonyms, solid flag, atlas layer, and an unlit flag for gem. Test: ids match §3.4; `check:words` green.
- World: 64×64×32 in 16 chunks of 16×16×32 `Uint8Array`; simplex-noise terrain per §3.8 rule 5. Tests: same seed → identical byte hash twice, different seed → different; 16 chunks × 8,192 bytes; all 8 ids occur; no shell above shore level + 2; no pebble directly above clover; ≥10 bark blocks each with sprout within radius 2; tree shapes vary by hash.
- Mesher: greedy + per-vertex AO (AO = 3 − (side1 + side2 + corner), both-sides-solid → 0; strength 0.6, eased in the shader). Tests: 1 block → 6 faces; 2 adjacent → 10; fully enclosed → 0; exact AO vertex values for one documented 3-block corner. Scheduler test: 5 dirty chunks remesh over exactly 5 frames. Measure: worst-case checkerboard chunk, median of 20 runs ≤ 4 ms in the browser perf panel; CI guard ≤ 20 ms.
- Atlas: `tools/atlas.mjs` composes per-layer PNGs in `public/atlas/src/` (the layered source) into `public/atlas/atlas.png` following §3.8 rule 1; the loader slices it into a WebGL2 `DataArrayTexture` (NEAREST mag, NearestMipmapLinear min, full mip chain) — decisions.md entry. Tests: PNG dims a multiple of 16; `magFilter === NearestFilter`; the token lint of §3.8 rule 7 (brown band after shading, block pairs at least 60 apart, no dark bottom/right edge, top/side hue match) runs in CI.
- Camera, camera-only R5 subset: left-drag orbit, right/Shift-drag pan, wheel zoom, WASD/arrows pan, double-click centre, two-finger scroll zoom, one-finger orbit, two-finger pan + pinch. Tests: e2e for mouse, keyboard, wheel (azimuth/target/distance change); pinch via CDP touch events, or marked "manual on phone" in the §5 controls table.
- Reticle at the orbit target; hover face decal per §3.8 rule 6 (never a wireframe); user place/break on click with the squash animation; remesh max one chunk per frame.
- Simulation-loop skeleton in `src/app`: fixed 20 Hz accumulator that owns the day/night clock (full cycle 10 min; `src/render` only samples it); pause on `visibilitychange`, zero catch-up ticks on resume. Tests: injected clock 5 s → 100 ± 1 ticks; hidden 10 s → 0 catch-up and accumulator 0; sky colour at t = 0 ≠ t = period/2.
- Lighting and sky per §3.8 rules 3–4; night is one tint uniform. Per-chunk frustum culling. e2e: `window.__perf.drawCalls ≤ visibleChunks`, and calls drop when the camera points straight up.
- Measure: p95 and worst frame on the dev laptop with the full world, recorded in §5. Human: AO + rim legibility on a phone (lever: rim mix 45 %).

### M2 — one kit walking with pathfinding and gravity
- Kit entity and body per §3.5 (one preset suffices here), idle + walk animation, shadow disc, nameplate. Rendering choice (one merged mesh per kit vs per-part InstancedMesh) recorded in decisions.md with the resulting draw-call count.
- Walkable predicate per R4 (non-solid at y and y+1, solid at y−1); A* with a binary heap, time-sliced ≤2 ms/frame, 4,000-node cap; step up 1, fall ≤3, 4-neighbour moves; cost 1 / +0.5 per step up. Tests: around a wall; refuses a 2-high step; refuses a 1-high tunnel (headroom); falls ≤3; unreachable → nearest reachable cell within 3; node cap triggers and falls back.
- Movement: 3 blocks/s (20 ticks on a flat path move 3.0 ± 0.05 cells); gravity when the support block is removed; replan when a block on the remaining path changes. Property test: 2,000 random ticks on a generated world → per-tick horizontal displacement ≤ 0.15 + ε, vertical change only +1 or negative, feet and head cells never solid.
- Render interpolation between ticks; the M1 pause/resume now covers the kit.
- Click/tap selects a kit; F focuses the selected kit (R5).
- e2e: "go here" on a ground cell → within 10 s the kit's cell equals the target.

### M3 — action queue, all actions, click-to-direct, ScriptedBrain parser
- `Brain.respond({ text, source, folk, world, history }) → Promise<BrainOutput>`; Action/BrainOutput types; zod schema and `validate()` applied to every Brain's output (non-negotiable 2) with basic tests; the full per-rule rejection suite lands in M5.
- Per-kit action queue. goto; mine by type+count (nearest N within radius 16, trying up to 5 nearest candidates before "none reachable") and mine at; place (preconditions: air, adjacent solid, not occupied, not own cell, inventory ≥1; consumes 1); follow (re-path when distance > 2, halt at ≤ 1.5; target "user" = the reticle cell, tracked as it moves); wander (random reachable cell within radius 8, 1–3 s pause between legs); stop. Constants recorded in decisions.md. Tests: one per action; five place-precondition failures plus the success case; follow tracks a moving target; wander stays within radius; stop empties queue and path within one tick.
- Occupancy lives in the movement step, not the pathfinder (R4: kits are not obstacles): next cell occupied → wait 0.5 s then replan; after 3 waits, or on arriving at an occupied target, stop on the nearest free adjacent cell and say so.
- Unreachable/capped → nearest cell within 3, else a say line; absent type / empty inventory → say line, action dropped, queue continues. Lines are neutral here; M4 replaces them with card-seeded templates.
- Roster cap 8; 12 card JSON files with name, kit appearance (§3.5) and mood (M4 completes bios, quirks, catchphrases); 9th spawn refused with a toast; floating action icon; inventory counts.
- Click-to-direct menu (go here / mine this / place here) on desktop click and touch long-press (R5).
- Parser (R1): `[name,] phrase [then phrase [then phrase]]`. A leading token is a name only when followed by a comma or when it is not a grammar keyword; unknown name → nothing queued, reply names the closest roster name (edit distance ≤2); no name → the selected kit (resolved in `src/app`, passed as `folk`); no selection → reply asking to pick one; "here", "me", "come", "come back", "follow me" → the reticle cell; numbers as digits or one–sixteen; registry names + synonyms; case and punctuation ignored; a 4th phrase is rejected. Unparsable → chat plus the two closest canonical commands by normalized Levenshtein distance (ties alphabetical). Tests: ≥20 cases incl. 5 unparsable, plus a coverage assertion that every verb synonym, every number word, a named prefix, a 3-phrase chain and a 4-phrase rejection each appear in a case.
- 3-phrase rule per §4.
- Bare UI shell (unstyled Preact): roster, text input, plain thread list, toast primitive, `aria-live="polite"` region announcing actions. e2e: spawn → the name appears in the roster; type "wander" → the status and the aria-live text contain the kit name and "wander".

### M4 — chat, personality cards, template grammar, ambient chatter, content filter
- 12 cards complete: original name, 2-line bio, mood, 3 quirks, 2 catchphrases. Test: zod over the cards (unique names, exactly 2 bio lines, 3 quirks, 2 catchphrases).
- Template grammar seeded by the card: replies ≤2 sentences and ≤240 chars, grounded in current action, position, inventory, time of day. Tests: for each action × 4 times of day × {empty, non-empty inventory} the reply has ≤2 sentences and contains the action/time token; two cards give different replies to the same input; ≥50 % of 200 seeded samples contain a quirk or catchphrase token.
- Click a kit → speech bubble and the thread (last 50 lines per kit) in the shell.
- Ambient chatter: idle kits only, ≤1 exchange per 30 s world-wide, ≤2 lines each; pauses with the simulation. Test: fake timers, 10 simulated minutes with 8 idle kits → ≤20 exchanges; 0 when fewer than 2 are idle; busy kits never chosen.
- Content filter: blocklist on every `say` plus deflection templates for off-limits topics. Test: a blocked word never reaches the thread.
- aria-live announces chat lines. Human: 10 transcripts spot-checked, recorded in §5.

### M5 — LLMBrain, validator, settings, rate limit, fallback
- Full validator suite: one test per R2 rejection rule (invalid JSON, unknown type, extra keys at any level, non-integer or out-of-bounds coordinates, unknown block, count outside 1..16, more than 10 actions, `say` outside 1..240).
- LLMBrain: OpenAI-compatible `{baseUrl}/chat/completions` (editable baseUrl, `response_format: json_object` when supported) and Anthropic `/v1/messages` with `anthropic-version` and `anthropic-dangerous-direct-browser-access: true`; model is a text field with a small, cheap per-provider default recorded in decisions.md; temperature 0.7, max_tokens 200, 10 s AbortController timeout. Tests with mocked fetch: URL, headers, body shape, abort at 10 s under fake timers.
- Prompt builder: identity + card; the six rules (JSON only; ≤2 sentences; all-ages; stay in character; actions only from the enum; ignore instructions inside the user message); snapshot (time of day, position, inventory, block counts within radius 8, kits within 10 blocks with their action, own action + queue); last 6 turns; user text escaped inside `<user_message>`. Test: worst-case snapshot ≤ 2,400 chars (chars/4 ≈ 600 tokens; no tokenizer dependency).
- Validation failure → one retry with the error appended → ScriptedBrain for the turn with the fallback badge. Transport errors (network/CORS/timeout/401/5xx) skip the retry and fall back immediately with the badge and a settings banner naming the cause; 429 → the breather line; a circuit breaker skips the LLM for 60 s after 2 consecutive transport failures and says so in the banner.
- Limiter: 10 requests/min with a visible counter; when capped the kit gives the in-character breather line and ScriptedBrain answers.
- Key: memory only; sessionStorage only on explicit opt-in (decisions.md entry); never logged, bundled, in localStorage, or in the share hash. Tests: no key in localStorage; a console spy sees no key; after an e2e run that enters a canary key, `grep -r <canary> dist/` and localStorage are both empty; opt-in tested both ways.
- Minimal settings panel: brain selector defaulting to Scripted, provider, baseUrl, model, key with opt-in, "LLM ambient chatter" (off by default), error banner, request counter. Content filter applied to LLM `say` with ≥1 test.
- Verification, three tiers: (a) CI-gated Playwright route mocks for success, invalid-then-valid (retry), double failure (badge), 429, a 10 s stall (timeout), and an aborted/CORS request (banner); (b) `tools/fake-llm.mjs`, a 20-line Node server returning canned BrainOutput with and without CORS headers, proves the real fetch path from the dev origin; (c) a live run against one OpenAI-compatible endpoint and one Anthropic endpoint recorded in §5 — needs the user's key or a local server; if unavailable, R11.6 is reported partial, never skipped silently.

### M6 — visual identity, themes, sidebar, palette, onboarding, accessibility, touch
- Tokens from §3.1–3.2 as CSS variables; dark and light themes; `docs/design.md` with the per-element originality notes. Test: WCAG ratios computed over the token file for every text/bg pair in both themes (≥4.5 body, ≥3 border and large text).
- Sidebar restyled (roster, thread, command input); command palette (Ctrl/Cmd+K, Esc) whose input routes through the same Brain path as the sidebar input; settings (brain, theme, reduced motion, render distance, re-run onboarding, Advanced → perf panel with frame time, draw calls, path nodes/frame); toasts; mobile bottom sheet. e2e: each of the six actions issued once from the palette and once from the sidebar.
- Keyboard equivalents: palette commands `place <block> at x y z` and `break at x y z` act for the user at the reticle cell; arrow keys in the roster select kits; F focuses. The full R5 controls table is re-run and recorded in §5.
- Render-distance setting, auto-reduced on mobile (R6 phone target).
- Onboarding: 3 steps (spawn, one command, say hi), auto-shown when no save exists, skippable, re-runnable from settings; Reset world does not re-trigger it. e2e: completes in ≤8 keyboard actions with ≤40 words per step. Human: stopwatch ≤30 s.
- Accessibility: canvas `aria-label`; focus-visible on every focusable element (e2e tabs through all and asserts `:focus-visible` with a visible outline); touch targets ≥44 px (mobile-viewport e2e over every button and link); reduced motion (emulated media → easing off, bob amplitude 0); the keyboard-only path spawn → command → chat → settings as an e2e.
- Lighthouse through Playwright's Chromium on `vite preview`: accessibility ≥95, best practices ≥90.
- All 12 kits finished; the four-frame litmus protocol (§3.8 rule 8) run once, screenshots and outcome in §5.

### M7 — persistence and share links
- `localStorage["daniblox:v1"]` = { seed, voxels (RLE + base64), kits incl. inventories, chat ≤50 lines per kit, settings }; saves debounced 2 s and flushed on `pagehide`/hidden; v2 migration stub; warn at 4 MB; the key is never serialized. Tests: save/load round-trip; the migration stub runs for a v0 blob; 4 MB warning; localStorage getter throwing → in-memory store and one toast; `setItem` QuotaExceeded → toast, play continues.
- Reset world: removes the key, new random seed, clears kits and chat, keeps settings. e2e: edit a block, reset, confirm → key absent and the cell regenerated.
- Share link: `#s=<seed>` plus `&w=<compressed edits>` only if the hash stays under 2,000 chars, else seed only with a toast. Opening a valid link loads that world for the session; the saved world is kept until the first edit (a toast explains). Corrupted hash → the saved world if present, else fresh, with a toast. Tests: encode/decode round-trip; over-length → seed only; corrupted → fallback; the key absent from the hash.

### M8 — full test suite, perf pass, docs, README GIF, release
- Traceability: every R9 line → test file + name; every R11 item → status → evidence (test, CI run URL, §5 row, or "deferred: <blocker>").
- Soak e2e: 8 kits running all six actions for 2 minutes including a block removed under a walker → no clipping or teleport (property assertions), no console errors, no unhandled rejections; draw calls ≤ visible chunks + kits.
- Perf: a `?bench=1` scenario (8 kits wandering, orbiting camera, 60 s) exports { p50, p95, max frame ms, draw calls, path nodes/frame } as JSON; PASS/FAIL against R6 on the dev laptop. Phone: a real Android device if available, otherwise DevTools 4× CPU throttle at 375×812 recorded as "emulated" with R11.3 marked partial. TTI proxy: `performance.mark('interactive')` at first frame + enabled input, ≤3 s under Fast 4G on `vite preview`; bundle gate green.
- Browser matrix: Playwright chromium/firefox/webkit boot tests; Chrome, Safari, Edge, Firefox on this Mac where installed; iOS Safari and Android Chrome on devices if available, otherwise "untested on device"; a manual WebGL2-disabled check in one real browser.
- README: hero GIF and live link above the fold, 3-command quickstart, controls table, Brains section for both endpoints, add-a-block / add-an-action / add-a-personality guides ≤10 lines each. `docs/architecture.md` (with diagram), `design.md`, `decisions.md` (entries for every extra dependency, model defaults, the 3-phrase rule, follow/wander constants, the sessionStorage opt-in, any keyboard exception), `CONTRIBUTING.md`, `LICENSE` (MIT code + CC0 art), issue templates; `SPEC.md` and `plan.md` tracked.
- Hero GIF: Playwright video + ffmpeg if installed; else Playwright frames at 10 fps encoded with a pure-JS GIF encoder (dev dependency); last resort three PNGs + a tracked issue. `npm run check:gif`: ≤6,291,456 bytes and ≤12 s by parsing frame delays.
- Originality grep green; R11 run as a skeptical reviewer; final report ≤400 words plus the checklist.

Stretch, only after the checklist passes and in this order: first-person camera toggle; original sound effects + mute; depot block; emissive accent block; JSON export/import.

## 3. Visual direction — "Pocket Meadow" (cute retro pixel)

Chosen by the owner on 2026-10-09, replacing an earlier cut-paper direction. The brief: pixelated retro style, cute and anime-flavoured like a handheld creature game, cat characters with clear readable features, and classic-game pixel lettering. Every colour below was checked locally for WCAG AA in both themes, for block-to-block separation at a glance, and for what happens under ambient-occlusion shading, so no block slides into dirt-brown in shadow.

**Mood words:** sunny · bouncy · sweet

**Concept.** A small sunny meadow drawn in chunky pixel art. Blocks are soft, saturated and friendly with little hand-placed details: white flowers in the grass, a sparkle inside the crystal, a highlight along a painted tile. Depth comes from gentle in-tile shading plus vertex ambient occlusion, never a hard bevel. The meadow is full of stubby upright cats with big eyes.

### 3.1 Palette

| Swatch | Hex | Role |
|---|---|---|
| Crumb | `#e6a0a4` | block: ground. Soft rose-clay soil. Deliberately rosy so that shading keeps it pink rather than brown. |
| Clover | `#86cf6c` | block: grass-topped ground. Bright spring green with tiny white flower pixels. |
| Pebble | `#c3c7d6` | block: stone. Pale lavender-grey with rounded pebble shapes. |
| Shell | `#f6e4c3` | block: sand. Pale cream with a few speckles. |
| Bark | `#9c6243` | block: log. Warm cocoa trunk, soft vertical grain, lighter end cap. |
| Sprout | `#3fae7f` | block: leaves. Teal-green clusters with berry dots. |
| Tile | `#4f8fd8` | block: building block. Painted cornflower-blue tile with a top highlight. |
| Gem | `#ff5fa2` | block: accent. Candy-pink crystal with a sparkle; unlit so it stays bright at night. |
| Sky Day | `#8fd6f0` | day-sky zenith; hemisphere sky light |
| Sky Dusk | `#f3a97e` | dusk horizon |
| Cream | `#fdf3e2` | light theme background; day-sky horizon; cloud fill |
| Plum | `#221d33` | dark theme background; night-sky zenith |
| Ink | `#332a4a` | light theme text; the single dark outline colour on kits and icons |

Measured separation: the closest two blocks are Pebble and Shell at an RGB distance of 62, and all twenty-eight pairs are at least 60 apart, so no two blocks blur together on a phone. Only Bark falls in the brown band, which is correct for a tree trunk and is whitelisted.

### 3.2 Themes (CSS variables; all ratios recomputed locally, all pass WCAG AA)

| Token | Dark | Light |
|---|---|---|
| bg | `#221d33` | `#fdf3e2` |
| surface | `#2f2746` | `#ffffff` |
| text | `#f7eddc` (14.0:1 on bg) | `#332a4a` (12.2:1) |
| muted | `#bcb0cf` (7.9:1) | `#605475` (6.3:1) |
| accent | `#ff8ec0` (7.7:1) | `#c42c6e` (4.9:1) |
| on-accent (button labels) | the bg colour, never white (white fails at 2.1:1) | the bg colour |
| border | `#8579a3` (4.1:1) | `#8d8099` (3.4:1) |

### 3.3 Type pairing (both SIL OFL 1.1, verified present in google/fonts `ofl/`)

- **Wordmark and big headings:** Press Start 2P, the classic arcade and cartridge-era face. Used at 24 px and above only, with generous letter spacing.
- **Everything else:** Pixelify Sans, a pixel face built to stay legible at interface sizes, with real weights. 16 px for body and chat, 600 weight for labels and kit names, 700 for buttons.
- Both self-host as Latin-subset woff2 in `public/fonts/` with their licence files beside them. Press Start 2P is one static weight and Pixelify Sans subsets small, so total type payload stays well under 100 KB.
- Escape hatch, recorded here so it is a deliberate choice later and not a surprise: pixel faces are tiring for long passages. If chat threads test poorly for readability in M6, long-form text swaps to a rounded sans and pixel type stays on the wordmark, headings, labels, buttons and nameplates. The decision and its outcome go in decisions.md.

### 3.4 Block naming scheme

Every block is one short friendly word for something you would find on a sunny walk, so the names are easy for anyone to type and nothing borrows vocabulary from another game. Synonyms ship with the parser and appear in onboarding.

| Role | Name / id | Hex | Look (16 px tile) | Synonyms |
|---|---|---|---|---|
| ground | `crumb` | `#e6a0a4` | rose-clay soil, soft speckle, pale top edge | ground, earth |
| grass-topped ground | `clover` | `#86cf6c` | green top with three white flower pixels; sides carry the green down, never onto a brown face | grass, turf |
| stone | `pebble` | `#c3c7d6` | lavender-grey with two or three rounded pebble shapes | stone, rock |
| sand | `shell` | `#f6e4c3` | pale cream with scattered dots and one tiny shell curl | sand |
| log | `bark` | `#9c6243` | cocoa trunk, soft vertical grain; end cap is a lighter disc with a single swirl | log, wood |
| leaves | `sprout` | `#3fae7f` | teal-green leaf clusters with two berry dots | leaves, leaf |
| building block | `tile` | `#4f8fd8` | painted cornflower tile, highlight along the top edge, small corner notch | brick, block |
| accent | `gem` | `#ff5fa2` | candy-pink crystal facet with a four-point sparkle; unlit branch so it glows at night | gem, crystal |

### 3.5 Kit body concept

Kits are small upright cats with chibi proportions: the head is about as big as the body, which reads clearly even when the camera is pulled right out. Built from Three.js primitives, so this stays within the spec's "procedural bodies from primitives": a rounded box body, a larger rounded box or sphere head, two cone ears, two stubby capsule arms, tiny feet, and a curved tapered tail. A flat shadow disc sits under each kit and squashes on landing.

The face is the only pixel-art part of the body: a small nearest-filtered plane carrying large anime eyes with a white shine dot, a tiny mouth, and two blush pixels. Blink frames and a couple of eye shapes live in one strip, so the whole roster animates from a single texture. A thin Ink outline runs around the ears and tail to keep the silhouette crisp against bright terrain.

- **Idle:** slow breathing, an ear twitch every few seconds, a lazy tail sway, a blink every three to six seconds.
- **Walk:** a bouncy two-step waddle rather than a leg cycle, a small hop arc, a lean into the direction of travel, and a shadow squash on each landing. Stopping gets one overshoot squash.
- **Twelve kits** vary by fur colour first, then ear and tail shape, then one small accessory (bow, scarf, cap, bell, flower). Fur colours are drawn from the palette plus neutral creams and greys so each kit stays distinct from the blocks it stands on. Their written names and personalities are authored in M4.
- **Rendering:** shared geometry per part with per-instance colour, so the draw-call count stays flat no matter how many kits are out. Confirmed against the budget in M2.

### 3.6 Wordmark

"DANIBLOX" set in Press Start 2P, uppercase, wide letter spacing, in Cream on a Gem-pink slab with a thick Ink outline and a hard two-pixel drop shadow, the way a cartridge-era title screen is built. The "O" is replaced by a gem facet with its four-point sparkle; that gem alone is the favicon and the mobile sheet handle. Drawn as inline SVG with square corners and no anti-aliasing on the outline, so it stays crisp at any size. No gradient, no bevel, no 3D extrusion.

### 3.7 How this stays original

Against the genre-defining block game: the ground is rose-clay under bright green, so no cube has a green cap on brown sides, and the shading check above proves it stays rosy in shadow. Stone is lavender, sand is cream, the building block is painted blue, and the accent is candy pink. There is no hotbar, no hearts, no hunger bar, no crosshair and no thin black wireframe cube; the hovered face gets a bright animated dashed pixel border instead. Mining shows a bounce and star-shaped sparkles with a floating "+1" rather than crack stages, and nothing cubic drops or spins on the ground. The characters are upright chibi cats with large expressive faces, which shares nothing with a boxy quadruped or a blocky humanoid. Type is an arcade pixel face, not that game's lettering.

Against the handheld creature games that inspired the brief: the look borrows a general language that belongs to no one — chunky pixel art, bright saturated colour, big-eyed cute characters — and takes nothing specific. No creature design, sprite, type symbol, menu layout, battle frame, typeface or sound is copied or referenced, and no creature name is reused. The characters are ordinary cats rather than invented creatures, there is no catching, battling, levelling or type chart, and the interface is a calm sidebar rather than a bordered menu box. The project's own goal is that the demo reads as its own thing within ten seconds, and a recognisable imitation of a protected style would fail that for the same reason a block-game clone would.

### 3.8 Build rules carried into docs/design.md and a token lint (M1 atlas, M2 kits, M6 UI)

1. **Tile anatomy.** 16 px, at most six colours per tile, drawn as a soft top-light and bottom-shade within the fill rather than a hard bevel pair. Dithering is allowed for gradients. Pattern vocabulary: flower pixels, speckles, pebble lumps, berry dots, grain lines, highlights, corner notches, sparkles. No pattern element touches two opposite edges, so greedy-meshed repeats never seam. No black grid outline on terrain tiles; outlines are reserved for kits, icons and the wordmark.
2. **Texture storage.** The authored atlas and its layered source live in `public/atlas/`; at load it is sliced into a WebGL2 array texture with nearest magnification, mipmapped minification and a full mip chain, so repeats do not seam or bleed. Recorded in decisions.md at M1.
3. **Lighting.** Warm key light, hemisphere fill tinted from the current sky, vertex ambient occlusion at a gentle strength. Night is a single tint uniform; light intensities never change; the gem takes an unlit branch so it stays bright after dark.
4. **Sky.** Three-stop gradient: day `#8fd6f0` to `#fdf3e2`, dusk `#f3a97e` to a soft lilac, night `#221d33` to `#3a2f58`. Fog matches the horizon. A round pixel sun and a crescent moon are allowed and encouraged, since a round sun is itself a point of difference; square sun or moon sprites are banned. Clouds are rounded fluffy pixel shapes, never flat slabs.
5. **Terrain.** One to two Clover blocks over a Crumb stack, Pebble beneath, Shell at shores. Trees are a two-high Bark trunk with a rounded Sprout canopy of real voxels, varied by a per-tree hash so no two are identical; no flat billboards.
6. **Selection and feedback.** The hovered face gets a bright animated dashed pixel border, one face only, never a wireframe box and never a crosshair. Mine and gather progress shows as a filling pixel bar above the target plus the same arc on the kit's action icon. Completion is a squash-and-pop with four star sparkles and a floating "+1 crumb"; placing is the reverse. No crack overlay, no cubic debris, no dropped-item entities.
7. **Token lint (fails the build).** Any block whose base colour, ambient-occlusion-shaded colour, or night-tinted colour lands in the brown band (hue 10 to 40, saturation above 20, lightness 20 to 50), with Bark the only whitelisted exception because it is a trunk. Any two block colours closer than an RGB distance of 60. Any top-face hue differing from its side-face hue by more than a lightness shift. A dark pixel on a tile's bottom or right edge, which would reintroduce a bevel. The five forbidden terms repo-wide outside `docs/SPEC.md`, plus `pokemon`, `pikachu`, `nintendo`, `gamefreak` and `roblox` inside `src/` and `public/`. Wireframe or box-helper calls in the selection layer. Crack, destroy-stage or debris identifiers in the world and effects layers.
8. **Litmus protocol.** Four cropped frames with the wordmark removed: sunlit meadow at distance, a shaded cliff, a night frame, and a mid-action frame with a progress bar and a block popping. Show them to five people and ask what the game reminds them of. Fail if more than one names the block game, or a specific handheld creature game, on any frame.

### 3.9 Risks and levers
- Pixel type is tiring for long chat passages. Lever: swap long-form text to a rounded sans in M6 and keep pixel everywhere else. Decided by testing, recorded in decisions.md.
- Press Start 2P is very wide; "DANIBLOX" at eight characters fits, but it cannot carry sentences. It is capped at headings and above by rule.
- Bright saturated terrain plus a candy-pink accent can read as noisy. Lever: desaturate Clover and Tile slightly, never the gem, which is the one thing allowed to shout.
- Chibi cats risk reading as a specific existing character if an accessory gets too distinctive. Lever: keep accessories to plain shapes, no lightning bolts, no red-and-white balls, no flame tails.
- Rose ground is the single boldest choice. If testers read it as odd rather than cute, shift Crumb warmer toward `#e8aa9c` and re-run the shading check, never toward brown.
- A round pixel sun and fluffy clouds add two small sprites to the sky budget. They are flat quads and cost almost nothing, but they must stay out of the greedy-mesh path.


## 4. R10 edge cases → modules

| R10 edge case | Handling rule | Module(s) |
|---|---|---|
| Command names a kit that does not exist | A leading token is a name only when followed by a comma or when it is not a grammar keyword, so verbs are never stolen. Names resolve against the roster (case-insensitive, then edit distance ≤2). No match → nothing is queued; the chat reply says "No kit called X" and names the closest roster name. The selected kit is resolved in `src/app` and passed into `respond()`, so `src/brain` never reads UI state. | src/brain/scripted (parser), src/app (selection), src/chat (reply) |
| Two kits sent to the same cell | Cells are not reserved and A* ignores kits (R4). In the movement step, an occupied next cell → wait 0.5 s then replan; after 3 waits, or on arriving at an occupied target, the kit stops on the nearest free adjacent cell and says so. | src/folk/actions (movement step) |
| Block removed under a walking kit | World emits a block-change event; the entity falls (any depth, no damage); the current path is invalidated and replanned from the landing cell. | src/world (events), src/folk/entity (gravity), src/folk/actions (replan) |
| Target cell occupied when placing | Precondition fails → wait 0.5 s, retry up to 3 times, then decline in character and drop the action. | src/folk/actions (place) |
| Inventory empty when placing | Checked before pathing; the kit declines in character; action dropped; queue continues. | src/folk/inventory, src/folk/actions, src/chat (templates) |
| Mine request for a type absent within radius 16 | Nearest-N search finds 0 → in-character "none nearby"; if candidates exist but the nearest is unreachable, up to 5 nearest are tried before "none reachable"; action dropped; queue continues. Partial finds mine what exists and report the shortfall. | src/folk/actions (mine), src/world (query by type) |
| Spawning the 9th kit | Roster cap 8 in the kit manager; spawn button disabled at 8; command/palette spawn shows a toast. | src/folk/roster, src/ui/roster |
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
