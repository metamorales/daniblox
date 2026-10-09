# Daniblox — plan

Process step P1 of docs/SPEC.md. Read the spec first; this file never overrides it.
Conventions: "Test:" is automated and runs in CI. "Measure:" is recorded in §5 with the instrument named. "Human:" is a manual check recorded in §5 with a date. Every milestone ends with lint, test, build green and a conventional commit.

## 0. Environment prerequisites (before M0)

| Item                          | Owner                                                                                          | Done when                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Homebrew installed            | user (needs password)                                                                          | `brew --version` prints                                                                                    |
| Node 20 + npm                 | me: `brew install node@20` and link it (fallback: `brew install node`, CI stays on 20)         | `node --version` prints v20.x, `npm --version` prints                                                      |
| ffmpeg (hero GIF, optional)   | me: `brew install ffmpeg`                                                                      | `ffmpeg -version` prints; pure-JS encoder is the fallback                                                  |
| Playwright browsers           | me: `npx playwright install chromium` (~150 MB); firefox + webkit later for the browser matrix | `npx playwright --version` and a boot test run                                                             |
| Git identity (repo-local)     | me                                                                                             | `git config user.email` prints the noreply address                                                         |
| Push access                   | user confirms SSH key or HTTPS credential                                                      | first `git push` succeeds                                                                                  |
| Pages source = GitHub Actions | user (done)                                                                                    | deploy job succeeds; `curl -sI` the Pages URL → 200                                                        |
| CI status without `gh`        | me                                                                                             | `curl -s https://api.github.com/repos/metamorales/daniblox/actions/runs?per_page=1` → conclusion "success" |

## 1. Name check — "Daniblox" (checked 2026-10-09)

| Where           | Result                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub          | No repository was named daniblox; this repo was renamed to `metamorales/daniblox` on 2026-10-09 (GitHub redirects the old URL). A user account "Daniblox" exists (created April 2026, no public repos) and does not block the repo name.                                                                                                                            |
| npm             | `daniblox` and `dani-blox` both unregistered.                                                                                                                                                                                                                                                                                                                       |
| Trademarks      | No Daniblox mark found. Noted risk: Roblox Corporation bars "Blox" in titles on its own platform, opposed BLOXEEZ at the trademark board in 2019, and sued the Bloxflip site, which also used Robux branding. Many unrelated "Blox" games ship on Steam. Judged low risk for a free MIT project that does not resemble Roblox; the owner accepted it on 2026-10-09. |
| Steam / itch.io | No match for daniblox.                                                                                                                                                                                                                                                                                                                                              |
| Domains         | daniblox.com/.io/.dev/.app unregistered (no DNS; whois "No match").                                                                                                                                                                                                                                                                                                 |

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

### M2 — the kit walking, with pathfinding and gravity

- One kit. Entity and body per section 3.5, idle and walk animation, shadow disc, nameplate. Rendering choice recorded in decisions.md with the resulting draw-call count.
- Walkable predicate per R4 (non-solid at y and y+1, solid at y−1); A* with a binary heap, time-sliced to 2 ms a frame, 4,000-node cap; step up 1, fall at most 3, four-neighbour moves; cost 1 per move and a half more per step up. Tests: around a wall; refuses a two-high step; refuses a one-high tunnel; falls at most 3; unreachable falls back to the nearest reachable cell within 3; the node cap trips and recovers.
- Movement at 3 blocks a second (20 ticks on flat ground move 3.0 ± 0.05 cells); gravity when the block underneath goes; replan when a block on the remaining path changes. Property test: 2,000 random ticks on a generated world, with per-tick horizontal movement at most 0.15, vertical change only +1 or negative, and the kit's feet and head never inside a solid block.
- Render interpolation between ticks; the M1 pause and resume now covers the kit.
- Click or tap selects the kit; F focuses it.
- Browser test: "go here" on a ground cell puts the kit on that cell within 10 seconds.
- Built so a second kit can be added later: the kit is held in a roster of one, not a singleton, and nothing assumes there is exactly one.

### M3 — action queue, small jobs and world-scale powers

- `Brain.respond({ text, source, folk, world, history }) → Promise<BrainOutput>`; Action and BrainOutput types; the zod schema and `validate()` gate every Brain's output, with the full per-rule rejection suite landing in M5.
- **Small jobs**, the six from the spec, which the kit walks over and performs: goto; mine by type and count (nearest within radius 16, trying the five nearest candidates before giving up) and mine at a cell; place (air, adjacent to something solid, not occupied, not its own cell, and it has one to spend); follow (re-path beyond 2 blocks, stop at 1.5; "user" means the reticle cell and tracks it); wander (a reachable cell within radius 8, pausing 1 to 3 seconds); stop. Constants recorded in decisions.md. One test per action, five place-precondition failures plus the success case.
- **World-scale powers**, a second closed set the kit can invoke without walking anywhere, each one animated so it reads as the kit doing it rather than the world blinking:
  - `sculpt` raise, lower or flatten terrain in a radius
  - `paint` the surface of an area with one block type
  - `plant` trees across an area
  - `scatter` a block type across an area
  - `clear` everything above ground in an area
  - `settime` to dawn, day, dusk or night
    Every one is bounded (radius at most 16, counts capped), reversible by the next command, and validated by the same schema. Tests: one per power, bounds rejected, and a determinism test so the same command on the same world gives the same result.
- Occupancy lives in the movement step, never the pathfinder. Unreachable, absent type and empty inventory are reported in character and the queue continues.
- Click-to-direct menu (go here, mine this, place here) on desktop click and touch long-press.
- Parser per R1, plus the world-scale verbs. A leading token is a name only when followed by a comma or when it is not a grammar keyword; "here" and "me" resolve to the reticle cell; numbers as digits or words; case and punctuation ignored; a fourth phrase is rejected. Unparsable input becomes chat plus the two closest commands by edit distance. At least 20 parser cases including 5 unparsable, with every verb, synonym and number word covered.
- Bare Preact shell: the kit's card, a text input, a plain chat list, a toast, and an `aria-live` region announcing actions.

### M4 — the kit's character and chat

- **One** hand-written personality card: name, two-line bio, mood, three quirks, two catchphrases. Tested against a schema.
- Template grammar seeded by the card: two sentences when acknowledging an order, up to about five when talking, grounded in what she is doing, where she is, what she carries and the time of day. Tests cover each action across four times of day and both an empty and a full inventory, and assert the card's voice shows up in at least half of 200 seeded samples.
- Clicking the kit opens a speech bubble; the sidebar keeps the last 50 lines.
- No content filter. The owner removed the all-ages rule on 2026-10-09; see decisions.md M4-0. Her written lines are clean because they are written, and nothing is layered over a model the player supplies.
- The `aria-live` region announces chat as well as actions.
- Ambient chatter is **cut**: with one character there is nobody to chat to. Recorded as a spec amendment; the scheduler is not built.

### M5 — the model brain, validator, settings, rate limit, fallback

This is where the world-scale powers get their point: plain English in, a reshaped world out.

- Full validator suite: one test per R2 rejection rule, extended to the world-scale actions.
- An OpenAI-compatible endpoint (`{baseUrl}/chat/completions`, editable base URL, JSON response format when supported) and an Anthropic endpoint (`/v1/messages` with the direct-browser-access header). Model is a text field with a small, cheap default per provider, recorded in decisions.md. Temperature 0.7, 200 max tokens, a 10 second abort. Mocked-fetch tests cover URL, headers, body shape and the abort.
- Prompt builder: identity and card; the six rules; a world snapshot (time of day, the kit's position, inventory, nearby block counts, its current action and queue); the last six turns; the player's text escaped inside a tag. A test keeps the worst case under the token budget.
- A schema failure retries once with the error appended, then falls back to the scripted brain with a visible badge. Transport failures skip the retry and fall back at once with a settings banner naming the cause; 429 gives the in-character breather line; two consecutive transport failures open a circuit breaker for 60 seconds.
- Ten requests a minute with a visible counter.
- The key lives in memory, and in sessionStorage only on an explicit opt-in. Tests prove it never reaches localStorage, the console, the share link, or the built files.
- Verification in three tiers: mocked routes in CI covering success, retry, double failure, 429, timeout and a blocked request; a tiny local fake server proving the real fetch path; and a live run against both endpoint kinds recorded in section 5, reported as partial rather than skipped if no key is available.

### M6 — visual identity, themes, sidebar, palette, onboarding, accessibility, touch

- Tokens from sections 3.1 and 3.2 as CSS variables, both themes, with `docs/design.md` and its originality notes. A test computes the contrast of every pair.
- Sidebar restyled (the kit's card, chat thread, command input); command palette on Ctrl or Cmd and K, Escape to close, routing through the same brain path as the sidebar; settings (brain, theme, reduced motion, render distance, replay onboarding, and an advanced panel showing frame time, draw calls and path nodes); toasts; a bottom sheet on phones. A browser test issues each small job and each world-scale power once from the palette and once from the sidebar.
- Keyboard equivalents for the player's own place and break at the reticle cell, and for focusing the kit. The full control table is re-run and recorded in section 5.
- A render-distance setting, reduced automatically on phones.
- Onboarding: three steps (meet the kit, give one order, say hello), shown when there is no save, skippable, replayable from settings. A browser test completes it in at most eight keyboard actions with at most 40 words a step; a human times it under 30 seconds.
- Accessibility: the canvas is labelled; every focusable element shows a focus ring; touch targets at least 44 px; reduced motion turns off easing and bobbing; a keyboard-only run goes from meeting the kit through an order and a chat to settings. Lighthouse at 95 for accessibility and 90 for best practices.
- The four-frame look test from section 3.8 rule 8, with its screenshots and outcome in section 5.

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

| Swatch   | Hex       | Role                                                                                                   |
| -------- | --------- | ------------------------------------------------------------------------------------------------------ |
| Crumb    | `#e6a0a4` | block: ground. Soft rose-clay soil. Deliberately rosy so that shading keeps it pink rather than brown. |
| Clover   | `#86cf6c` | block: grass-topped ground. Bright spring green with tiny white flower pixels.                         |
| Pebble   | `#c3c7d6` | block: stone. Pale lavender-grey with rounded pebble shapes.                                           |
| Shell    | `#f6e4c3` | block: sand. Pale cream with a few speckles.                                                           |
| Bark     | `#9c6243` | block: log. Warm cocoa trunk, soft vertical grain, lighter end cap.                                    |
| Sprout   | `#3fae7f` | block: leaves. Teal-green clusters with berry dots.                                                    |
| Tile     | `#4f8fd8` | block: building block. Painted cornflower-blue tile with a top highlight.                              |
| Gem      | `#ff5fa2` | block: accent. Candy-pink crystal with a sparkle; unlit so it stays bright at night.                   |
| Sky Day  | `#8fd6f0` | day-sky zenith; hemisphere sky light                                                                   |
| Sky Dusk | `#f3a97e` | dusk horizon                                                                                           |
| Cream    | `#fdf3e2` | light theme background; day-sky horizon; cloud fill                                                    |
| Plum     | `#221d33` | dark theme background; night-sky zenith                                                                |
| Ink      | `#332a4a` | light theme text; the single dark outline colour on kits and icons                                     |

Measured separation: the closest two blocks are Pebble and Shell at an RGB distance of 62, and all twenty-eight pairs are at least 60 apart, so no two blocks blur together on a phone. Only Bark falls in the brown band, which is correct for a tree trunk and is whitelisted.

### 3.2 Themes (CSS variables; all ratios recomputed locally, all pass WCAG AA)

| Token                     | Dark                                              | Light              |
| ------------------------- | ------------------------------------------------- | ------------------ |
| bg                        | `#221d33`                                         | `#fdf3e2`          |
| surface                   | `#2f2746`                                         | `#ffffff`          |
| text                      | `#f7eddc` (14.0:1 on bg)                          | `#332a4a` (12.2:1) |
| muted                     | `#bcb0cf` (7.9:1)                                 | `#605475` (6.3:1)  |
| accent                    | `#ff8ec0` (7.7:1)                                 | `#c42c6e` (4.9:1)  |
| on-accent (button labels) | the bg colour, never white (white fails at 2.1:1) | the bg colour      |
| border                    | `#8579a3` (4.1:1)                                 | `#8d8099` (3.4:1)  |

### 3.3 Type pairing (both SIL OFL 1.1, verified present in google/fonts `ofl/`)

- **Wordmark and big headings:** Press Start 2P, the classic arcade and cartridge-era face. Used at 24 px and above only, with generous letter spacing.
- **Everything else:** Pixelify Sans, a pixel face built to stay legible at interface sizes, with real weights. 16 px for body and chat, 600 weight for labels and kit names, 700 for buttons.
- Both self-host as Latin-subset woff2 in `public/fonts/` with their licence files beside them. Press Start 2P is one static weight and Pixelify Sans subsets small, so total type payload stays well under 100 KB.
- Escape hatch, recorded here so it is a deliberate choice later and not a surprise: pixel faces are tiring for long passages. If chat threads test poorly for readability in M6, long-form text swaps to a rounded sans and pixel type stays on the wordmark, headings, labels, buttons and nameplates. The decision and its outcome go in decisions.md.

### 3.4 Block naming scheme

Every block is one short friendly word for something you would find on a sunny walk, so the names are easy for anyone to type and nothing borrows vocabulary from another game. Synonyms ship with the parser and appear in onboarding.

| Role                | Name / id | Hex       | Look (16 px tile)                                                                             | Synonyms      |
| ------------------- | --------- | --------- | --------------------------------------------------------------------------------------------- | ------------- |
| ground              | `crumb`   | `#e6a0a4` | rose-clay soil, soft speckle, pale top edge                                                   | ground, earth |
| grass-topped ground | `clover`  | `#86cf6c` | green top with three white flower pixels; sides carry the green down, never onto a brown face | grass, turf   |
| stone               | `pebble`  | `#c3c7d6` | lavender-grey with two or three rounded pebble shapes                                         | stone, rock   |
| sand                | `shell`   | `#f6e4c3` | pale cream with scattered dots and one tiny shell curl                                        | sand          |
| log                 | `bark`    | `#9c6243` | cocoa trunk, soft vertical grain; end cap is a lighter disc with a single swirl               | log, wood     |
| leaves              | `sprout`  | `#3fae7f` | teal-green leaf clusters with two berry dots                                                  | leaves, leaf  |
| building block      | `tile`    | `#4f8fd8` | painted cornflower tile, highlight along the top edge, small corner notch                     | brick, block  |
| accent              | `gem`     | `#ff5fa2` | candy-pink crystal facet with a four-point sparkle; unlit branch so it glows at night         | gem, crystal  |

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

| R10 edge case                                   | Handling rule                                                                                                                                                                                                                                                                                                                                                                                                          | Module(s)                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Command names a kit that does not exist         | A leading token is a name only when followed by a comma or when it is not a grammar keyword, so verbs are never stolen. Names resolve against the roster (case-insensitive, then edit distance ≤2). No match → nothing is queued; the chat reply says "No kit called X" and names the closest roster name. The selected kit is resolved in `src/app` and passed into `respond()`, so `src/brain` never reads UI state. | src/brain/scripted (parser), src/app (selection), src/chat (reply)                  |
| Two kits sent to the same cell                  | Cells are not reserved and A* ignores kits (R4). In the movement step, an occupied next cell → wait 0.5 s then replan; after 3 waits, or on arriving at an occupied target, the kit stops on the nearest free adjacent cell and says so.                                                                                                                                                                               | src/folk/actions (movement step)                                                    |
| Block removed under a walking kit               | World emits a block-change event; the entity falls (any depth, no damage); the current path is invalidated and replanned from the landing cell.                                                                                                                                                                                                                                                                        | src/world (events), src/folk/entity (gravity), src/folk/actions (replan)            |
| Target cell occupied when placing               | Precondition fails → wait 0.5 s, retry up to 3 times, then decline in character and drop the action.                                                                                                                                                                                                                                                                                                                   | src/folk/actions (place)                                                            |
| Inventory empty when placing                    | Checked before pathing; the kit declines in character; action dropped; queue continues.                                                                                                                                                                                                                                                                                                                                | src/folk/inventory, src/folk/actions, src/chat (templates)                          |
| Mine request for a type absent within radius 16 | Nearest-N search finds 0 → in-character "none nearby"; if candidates exist but the nearest is unreachable, up to 5 nearest are tried before "none reachable"; action dropped; queue continues. Partial finds mine what exists and report the shortfall.                                                                                                                                                                | src/folk/actions (mine), src/world (query by type)                                  |
| Asking for a second kit                         | The roster holds one. A request for another is declined in character with a toast saying more are coming later. The roster is a collection, not a singleton, so raising the cap is a one-line change.                                                                                                                                                                                                                  | src/folk/roster, src/ui/roster                                                      |
| LLM returns valid JSON with an unknown action   | zod discriminated union with `.strict()` rejects; the error is appended and the request retried once; a second failure → ScriptedBrain for the turn + fallback badge.                                                                                                                                                                                                                                                  | src/brain/schema, src/brain/llm                                                     |
| LLM endpoint unreachable or CORS-blocked        | Transport errors (network/CORS, timeout, 401, 5xx) skip the validation retry and fall back immediately with the badge; the settings banner names the cause and a hint; 429 → breather line; a circuit breaker skips the LLM for 60 s after 2 consecutive transport failures. Failed calls count against the limiter.                                                                                                   | src/brain/llm (errors, breaker), src/ui/settings                                    |
| localStorage disabled or full                   | Every access wrapped; on failure switch to an in-memory store for the session and toast once; QuotaExceeded on save → toast, keep playing; warn at 4 MB first.                                                                                                                                                                                                                                                         | src/app/persistence, src/ui/toasts                                                  |
| WebGL2 missing                                  | Bootstrap probes `getContext('webgl2')` on a throwaway canvas before importing Three.js; failure renders a static fallback screen. The `nowebgl` Playwright project exercises this path on every CI run.                                                                                                                                                                                                               | src/app/bootstrap, src/ui (fallback screen)                                         |
| Share hash corrupted                            | Decoder validates seed and edits (zod + checksum); invalid edits are ignored (seed-only), an invalid seed falls back to the saved world if present, else a fresh one; toast "Share link was damaged". A valid link loads its world for the session and leaves the saved world untouched until the first edit.                                                                                                          | src/app/share, src/app/persistence                                                  |
| 3-phrase command where phrase 2 fails           | Parse-time: any unparsable phrase rejects the whole command; the reply names the phrase and suggests the two closest commands. Run-time: a failing phrase (unreachable, nothing to mine, empty inventory, occupied cell) is reported in character and the queue continues with the next phrase. Documented in README.                                                                                                  | src/brain/scripted (parser), src/folk/actions (queue)                               |
| Page hidden                                     | `visibilitychange` pauses the fixed-step loop (which owns the day/night clock) and the ambient-chatter timer and flushes any pending save; on resume the accumulator is reset so there is no catch-up burst.                                                                                                                                                                                                           | src/app/loop, src/render (samples the clock), src/chat/ambient, src/app/persistence |

## 5. Measurements and evidence

Still to come: frame-time tables from M1 on, the full R5 controls table, R9 traceability, the R11 evidence table, and the litmus protocol with its four screenshots.

### M0 (2026-10-09, Apple Silicon, Node 20.20.2, Chromium 156 headless)

| Measurement                                         | Value                         | Budget  | Status                                            |
| --------------------------------------------------- | ----------------------------- | ------- | ------------------------------------------------- |
| Bundle, gzipped JS + CSS, excluding atlas and fonts | 123.4 KB                      | 600 KB  | pass, 20.6 % used                                 |
| of which Three.js                                   | 117.6 KB                      | —       | the renderer chunk, not downloaded without WebGL2 |
| Self-hosted fonts                                   | 16.7 KB                       | —       | two latin-subset woff2 files                      |
| Unit tests                                          | 6 passed                      | —       | pass                                              |
| End-to-end tests                                    | 3 passed across both projects | —       | pass                                              |
| `npm audit`                                         | 0 vulnerabilities             | no high | pass                                              |

### M1 (2026-10-09, Apple Silicon, Chromium 156 on the real GPU, 1920x1080)

| Measurement                          | Value                       | Budget                    | Status                                      |
| ------------------------------------ | --------------------------- | ------------------------- | ------------------------------------------- |
| Frame time, p50                      | 10.0 ms                     | —                         | pass                                        |
| Frame time, p95                      | 10.5 ms                     | 16.7 ms                   | pass                                        |
| Frame time, worst                    | 11.0 ms                     | 33 ms                     | pass                                        |
| Draw calls                           | 18                          | visible chunks + overlays | pass, 16 chunks plus sky, reticle and decal |
| Triangles                            | 16,558                      | —                         | the whole 64 by 64 world                    |
| Chunk remesh, real terrain           | under 1 ms                  | 4 ms                      | pass                                        |
| Chunk remesh, synthetic checkerboard | 3.0 ms median, 6.8 ms worst | 4 ms                      | partial, see below                          |

Measured while orbiting, so chunks continuously enter and leave the view. The
checkerboard case fills a chunk with alternating solid and air, which is the
one shape greedy meshing cannot merge at all; ordinary terrain and ordinary
player edits stay under a millisecond. The lever, if a player ever builds one,
is preallocating the mesher's output arrays instead of growing JavaScript
arrays and converting at the end. Tracked for M8.

Not yet measured: a real Android device, and frame time with kits active.

M0 checks that are automated rather than measured: the originality word check, the folder README limit, the import boundary fixture, the WebGL2 fallback path, and the absence of console errors and unhandled rejections in both e2e projects.
