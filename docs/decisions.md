# Decisions

One entry per non-obvious choice: what, why, what was rejected. Five lines or fewer each, newest last. Keep this file current (see CLAUDE.md).

## P1-1 — Keep the name "Voxelfolk" (2026-10-04) — SUPERSEDED by P1-9

What: the working title stays; NPCs are "folk".
Why: GitHub (only this repo), npm, PyPI, five domains, Steam, itch.io, and trademark searches are all clear; "voxel" is a generic term.
Rejected: proposing three alternatives (the spec asks for them only if the name is taken).

## P1-2 — The block game's name appears only in docs/SPEC.md

What: plan.md and design.md describe differences from "the genre-defining block game" without naming it.
Why: P1 and the design.md requirement ask for comparison paragraphs that name it, but non-negotiable 1 and R11.9 forbid the name outside SPEC.md; keeping the comparisons and dropping the name is the closest conforming reading.
Rejected: naming it in docs (fails the R11.9 grep).

## P1-3 — SPEC.md is saved verbatim with no title

What: docs/SPEC.md is the pasted spec from `<role>` to `</deliverable>`, unmodified.
Why: quotes and greps against it must match the author's text.
Rejected: adding a Markdown title or front-matter.

## P1-4 — 3-phrase command failure rule

What: parse-time failure of any phrase rejects the whole command and names the phrase; run-time failure (unreachable, nothing to mine, empty inventory, occupied cell) is reported in character and the queue continues with the next phrase.
Why: a typo should not move a folk halfway; a world condition should not cancel the rest of a sensible request.
Rejected: stopping the queue on any failure.

## P1-5 — Schema and validate() land in M3, the full rejection suite in M5

What: the zod schema and validation gate every Brain's output from M3; the one-test-per-R2-rule suite and the retry/fallback semantics land in M5 with LLMBrain.
Why: non-negotiable 2 requires all Brain output to be validated and ScriptedBrain ships in M3, while P2 lists "validator" under M5.
Rejected: leaving ScriptedBrain unvalidated until M5.

## P1-6 — Node 20 pinned in CI despite end-of-life

What: CI runs Node 20 per R9; package.json `engines` is ">=20"; local development uses node@20 from Homebrew (fallback: the current LTS locally).
Why: the spec fixes Node 20; it reached end-of-life in April 2026.
Rejected: silently moving CI to a newer Node (diverges from the spec).

## P1-7 — Visual identity fixed at P1 so M0 can ship fonts and the wordmark

What: palette, type pairing, wordmark, and block names were decided and user-approved in plan.md §3 before M0.
Why: M0 needs self-hosted fonts and a shell; M6 themes and documents the identity instead of inventing it late.
Rejected: a provisional M0 identity reworked in M6.

## P1-8 — Hero GIF tooling order

What: Playwright video + ffmpeg (Homebrew) if installed; else Playwright frames encoded with a pure-JS GIF encoder as a dev dependency; else the spec's three PNG screenshots plus a tracked issue.
Why: ffmpeg is absent on the dev machine; a pure-JS encoder keeps the GIF deliverable without a native binary.
Rejected: skipping straight to PNGs.

## P1-9 — Renamed the project to Daniblox (2026-10-09)

What: the owner chose "Daniblox"; the GitHub repo was renamed from voxelfolk to daniblox, so the Pages URL and the Vite base both become /daniblox/ and the save key becomes "daniblox:v1".
Why: owner's call; P1 allows a rename and says to apply it everywhere. Checks were clean: npm, domains, Steam, itch.io and GitHub all free.
Noted risk, accepted by the owner: Roblox bars "Blox" titles on its own platform, opposed BLOXEEZ at the trademark board and sued Bloxflip, though many unrelated Blox games ship on Steam. Low risk for a free MIT project that does not resemble Roblox.
Rejected: keeping Voxelfolk; keeping the old repo name while renaming the product.

## P1-10 — docs/SPEC.md keeps the old name and the old save key (2026-10-09)

What: SPEC.md still says "Voxelfolk" and localStorage key "voxelfolk:v1"; the product uses Daniblox and "daniblox:v1".
Why: SPEC.md is stored verbatim by instruction and is a historical document; P1 anticipated a rename and told us to apply it everywhere else.
Rejected: editing SPEC.md (breaks the verbatim guarantee and the R11.9 grep baseline).

## P1-11 — Visual direction replaced with "Pocket Meadow" (2026-10-09)

What: the cut-paper direction is dropped. New look is cute retro pixel art: rose-clay ground under bright green, lavender stone, cream sand, teal leaves, painted blue building block, candy-pink crystal accent.
Why: owner's call. Palette was verified locally for WCAG AA in both themes, for at-a-glance separation (all 28 block pairs at least 60 apart in RGB), and for shading safety (no block except the tree trunk lands in the brown band after ambient occlusion).
Rejected: the paper direction and its four runners-up.

## P1-12 — NPCs are "kits"; the source folder stays src/folk/ (2026-10-09)

What: every user-facing string says "kit"; the folder is still src/folk/ and Brain.respond still takes a `folk` field.
Why: the spec fixes the folder layout and the respond() signature, so changing them would diverge for no gain; the spoken name is pure copy.
Rejected: renaming the folder to src/kits/; keeping "folk" in the interface now that the characters are visibly cats.

## P1-13 — Type is Press Start 2P plus Pixelify Sans, with a readability escape hatch (2026-10-09)

What: Press Start 2P for the wordmark and headings at 24 px and up; Pixelify Sans for all other text including chat. Both SIL OFL on Google Fonts, self-hosted.
Why: the owner asked for classic-game pixel lettering; Pixelify Sans is the one pixel face designed to stay legible at interface sizes.
Risk: pixel type tires the eye over long passages. If chat tests poorly in M6, long-form text moves to a rounded sans and pixel type stays everywhere else. Outcome to be recorded here.
Rejected: pixel type for the wordmark only; Press Start 2P for body text, which is unreadable below about 16 px.

## P1-14 — Inspiration is taken as a general style, not as a specific game (2026-10-09)

What: the look uses chunky pixel art, bright saturated colour and big-eyed cute characters. It copies no creature design, sprite, symbol, menu frame, typeface or name from any handheld creature game, and the characters are ordinary cats with no catching, battling or levelling.
Why: the spec's whole point is that a cropped screenshot reads as its own thing; a recognisable imitation of a protected style fails that the same way a block-game clone would.
How it is enforced: the build word-check also fails on pokemon, pikachu, nintendo, gamefreak and roblox inside src/ and public/, and the litmus protocol asks testers whether any frame reminds them of a specific game.

## M0-1 — Vitest pinned to 4.x (2026-10-09)

What: Vitest 3 was replaced by Vitest 4 during scaffolding.
Why: Vitest 3 pulls a tinypool with two critical advisories, and spec R9 makes `npm audit` with no high findings a CI gate. Vitest 4 resolves them; the repo now audits clean.
Rejected: an audit ignore list, and pinning an older tinypool by hand.

## M0-2 — Three.js is a named manual chunk loaded dynamically (2026-10-09)

What: `src/main.ts` probes WebGL2 on a throwaway canvas and only then dynamic-imports the bootstrap; Rollup puts everything under node_modules/three into a chunk named `three`.
Why: a browser without WebGL2 should not download 118 KB it cannot use, and the predictable chunk name lets the no-WebGL e2e assert the file was never requested.
Rejected: a static import with a runtime guard, which downloads the renderer regardless.

## M0-3 — The wordmark is HTML text, not SVG glyphs (2026-10-09)

What: the wordmark renders real text in the display face with a CSS slab, border and offset shadow; only the gem that replaces the "O" is SVG.
Why: Preact passes camelCase SVG attributes through unchanged, so `fontFamily` never applied and the display font was never exercised. Real text also loads the font honestly, scales with the type system and reads as one name to assistive technology.
Rejected: kebab-case SVG attributes, which would have worked but left the mark unselectable and the font load dependent on an attribute quirk.

## M0-4 — The sky gradient is compressed around the horizon (2026-10-09)

What: the three-stop sky reaches full zenith blue about 19 degrees above the horizon, and carries its own warm stop below.
Why: a god-view camera spends most of its time angled downward. With a physically even gradient the visible frame was flat cream and the sky read as a blank backdrop.
Rejected: raising the camera pitch, which fights the god-view framing the spec asks for.

## M0-5 — Vertical field of view widens on portrait viewports (2026-10-09)

What: below an aspect ratio of 1 the camera widens its vertical field of view, capped at 82 degrees, to hold the horizontal view steady.
Why: a fixed vertical field of view cropped the scene badly on a phone held upright.
Rejected: moving the camera further back, which changes the composition on desktop too.

## M0-6 — Fonts are committed as latin-subset woff2 (2026-10-09)

What: Press Start 2P and Pixelify Sans were fetched once from the Google Fonts stylesheet API as latin-subset woff2 and committed under public/fonts with their licence files. Together they are 17 KB.
Why: non-negotiable 5 forbids runtime network requests other than the user's own model endpoint, so nothing may load from a font CDN.
Rejected: subsetting the variable originals locally, which needs a Python font toolchain for no gain over the already-subset files.

## M2-2 — Luciana is Luciana: white and black, curious and a bit mischievous (2026-10-09)

What: the one kit is named Luciana and wears a tuxedo coat, white with black over the crown, ears, saddle and tail.
Why: the owner named and designed her. The markings use the palette's own white and ink, so no new colour enters the world, and the black crown plus tall pointed ears is what makes her read as a cat rather than a small person.
Note: the coat is pure white rather than the palette's cream, and her bounce light is neutral rather than the terrain's rose, because under rose bounce a cream cat read as skin against the green.

## M2-3 — A kit is baked into three meshes, not twenty (2026-10-09)

What: every part that animates together is merged into one geometry carrying its colours on the vertices. Luciana is a torso mesh, a head mesh, a tail mesh, plus a face, a nameplate and a shadow: six draw calls.
Why: assembled part by part she cost 39 draw calls on her own and broke the budget immediately.
Rejected: one mesh with per-part transforms in the vertex shader, which would reach a single call but costs far more code than the budget needs.

## M2-4 — The draw-call budget counts overlays explicitly (2026-10-09)

What: the test asserts draw calls at most visible chunks, plus six per kit, plus four.
Why: spec R6 says "draw calls <= visible chunks + folk", which leaves no room for the sky, the ground reticle, the hovered-face decal, or a kit's face and nameplate. Taken literally no version of this game could pass. The reading here keeps the per-chunk and per-kit discipline the budget is really about and names the fixed overlay cost out loud.
Rejected: dropping the reticle or the nameplate to satisfy the arithmetic.

## M2-5 — Test worlds must be sealed across the whole world (2026-10-09)

What: a pathfinding fixture that builds a small floor and walls it off does not actually wall anything off.
Why: the ground below the world is solid, so a kit walks off the edge of the test floor, crosses on the bedrock and climbs back up the far side. Two tests were asserting the wrong thing until this surfaced.
How to apply: walls and ceilings in pathfinding tests span the full 64 cells.

## M3-1 — Articles are not counts (2026-10-09)

What: "a" and "an" are filler, not the number one.
Why: with them in the number table, "plant a forest here" asked for exactly one tree. "Grab a gem" still gives one, because a missing count defaults to one anyway.
Rejected: special-casing the plant verb, which would leave the same trap for every other verb.

## M3-2 — A bare leading word is a name only if it is not a verb (2026-10-09)

What: addressing a kit by name without a comma works only when the name is not something the grammar already understands.
Why: a kit called Scatter would otherwise swallow "scatter gems here" and leave the parser with "gems here".
Rejected: requiring a comma always, which makes the common case fussier than it needs to be.

## M3-3 — Block names are matched in the plural too (2026-10-09)

What: a trailing "s" is stripped when a word fails to match a block.
Why: people type "scatter gems", not "scatter gem", and the whole point of the grammar is that it accepts what someone would actually write.

## M4-0 — No content filter, and replies stretch for conversation (2026-10-09)

What: the owner removed the all-ages rule. There is no word blocklist over Luciana's lines and no all-ages instruction in her prompt. Replies stay at two sentences when she is acknowledging an order and may run to about five when she is talking.
Why: owner's call. A companion capped at two sentences cannot hold a conversation, and a filter on top of a model the player supplies adds nothing except surprise.
Amends spec R7 (all-ages on both brains) and R11.14 (a content filter with a test per brain). Both will be reported as amended rather than failed.
What does not change: her prompt will not contain text engineered to work around a provider's own policies, which would be a jailbreak rather than a personality; and the closed action vocabulary is still enforced, because that gate is about safety of execution, not taste.

## M4-1 — Rate limit stays at ten a minute (2026-10-09)

What: the model brain still caps at ten requests a minute with a visible counter.
Why: the owner kept it. It is a spend guard against a loop, and a person typing by hand rarely reaches it.

## M5-1 — The default model is local and Apache licensed (2026-10-09)

What: the openai-compatible default points at http://localhost:11434/v1 with qwen2.5:7b, which is what Ollama serves locally. Anthropic's default is claude-haiku-4-5-20251001.
Why: a local model needs no key, costs nothing and sends nothing off the machine, which suits a demo anyone can clone. Qwen2.5 7B is Apache 2.0.
Caught during setup: the 3B of the same family is under the Qwen Research Licence, research use only, so it was removed and replaced. The project never redistributes a model, but the default should be one anybody can use for anything.

## M5-2 — A transport failure never retries (2026-10-09)

What: a malformed reply is retried once with the complaint attached. A timeout, a refused connection, a blocked request, a bad key or a server error falls back at once, and two in a row open a circuit breaker for a minute.
Why: spec R2's single retry is for schema failures. Retrying a ten-second timeout would mean twenty seconds of silence, and retrying a refused connection just fails twice.
Verified live against a local server: a dead address and a wrong model name each fell back to her own words, showed a banner naming the cause, and still carried out the command.

## M5-3 — Chat lines carry a marker so tests can count them (2026-10-09)

What: real chat lines have a data attribute; the empty-state placeholder does not.
Why: the placeholder is also a list item, so counting list items was off by one and the tests were reading job reports as her speech.

## M5-4 — Tests that break the network opt out of the console guard (2026-10-09)

What: a fixture flag lets a test allow browser-generated resource errors.
Why: the browser logs a refused request by itself and the page cannot silence it. Without the flag, deliberately testing a failure would fail on the noise it was meant to cause.

## M5-5 — A local model cannot be reached from the deployed site (2026-10-09)

What: a page served over HTTPS may not call http://localhost. Chrome treats it as a public page reaching into a private network and refuses before the request leaves. Verified both ways: the deployed site throws, the same build served locally gets a 200.
Why it matters: the obvious thing to try, opening the demo link and pointing it at Ollama, cannot work, and the generic "could not reach that address" was misleading.
What was done: that case is now detected and named, and the banner tells the player to either run Daniblox locally or use a hosted provider on the deployed site. There is no fix from inside the page; this is the browser doing its job.

## M5-6 — Default local model moved to Qwen 3.5 9B; optional request fields are dropped one at a time (2026-10-09)

What: the local default is now qwen3.5:9b (Apache 2.0, confirmed from the model file). The request still asks for JSON mode and for no hidden reasoning; when a server refuses one of those fields with 400, 422 or 501, that field alone is dropped and remembered until the settings change.
Why: this model reasons by default and the Ollama build of it does not support JSON mode. Sent as before, the server refused the request outright; with both fields stripped together, the model spent the entire 200-token budget thinking and the visible reply was empty, which looked like a ten-second timeout. Dropping one field at a time keeps the no-reasoning request alive.
Rejected: a per-model settings toggle (one more thing to explain), and a hand-built model file on the Ollama side (fixes one machine, not the clone).
Also pulled: qwen3.5:27b for chat outside the game. It needs about 18.4 GiB free and this 24 GB machine has 17 GiB free with the game and a browser open, so it is a close-everything-else model and not a default.

## M5-7 — Time never runs backwards, and the reticle never sits below the world (2026-10-09)

What: the loop clamps a frame's elapsed time at zero before anyone sees it, the camera easing is held to the 0..1 range, and the reticle cell's height is never negative. The scripted brain now logs loudly when its own output fails the schema.
Why: under load, two end-to-end tests failed about one run in twenty with "something went sideways", which is the line for an output of ours that failed our own schema. The logged cause was a reticle one block below the world. An animation-frame timestamp marks the start of the frame, which can fall before the clock read when the loop was armed, so the first frame's elapsed time came out negative, the easing ran backwards for a frame, and a command sent at that moment pointed at y = -1. Verified: 64 runs at four workers, zero failures, where before it was two in 32.

## M6-1 — A plain click on a block opens a menu; the modifiers stay as quick hands (2026-10-09)

What: clicking or long-pressing a block opens a small menu with three things Luciana can do there and two the player can do themselves. Shift-click still places a tile and Alt-click still breaks, without the menu.
Why: spec R5 asks for click-to-direct and a long-press menu on touch. One menu for both pointer kinds means one code path and one set of tests, and the player's own edits sit in the same list rather than behind a key only a tour guide would know.
Rejected: a plain click that breaks a block outright, which M1 shipped. Losing a block to a mis-click while trying to point at it was the more common accident.

## M6-2 — Near render distance is 24 blocks from the orbit point, and fog follows it (2026-10-09)

What: "near" keeps chunks whose centre is within 24 blocks of the point the camera orbits, which is four of sixteen at the default view, and sets fog to close exactly at that reach. "Automatic" picks near when the viewport is under 720 px wide or the pointer is coarse.
Why: the phone budget in R6 asks for reduced distance. Measuring from the orbit point rather than the camera keeps the visible set stable while zooming, and fog at the reach turns the cut-off into haze instead of a cliff.

## M6-3 — The welcome keys on a seen flag and on the save (2026-10-09)

What: the three-step welcome shows when neither `daniblox:onboarded` nor the save key exists in local storage. Finishing or skipping writes the flag; settings can bring it back. With storage switched off it shows on every visit and is one key to dismiss.
Why: "shown when there is no save" is the plan's rule, and M7's save arrives later; the flag covers the gap and also stops the welcome returning after a reset, which keeps the flag while removing the save.

## M6-4 — Pixel type stays everywhere; the escape hatch was not needed (2026-10-09)

What: Pixelify Sans remains the face for chat and body text, not only labels.
Why: the plan reserved a swap to a rounded sans if long chat threads tested poorly. Read across a few hundred lines in both themes at 16 px it held up, and one face keeps the panel consistent with the world.

## M6-5 — Perf numbers are sampled only while the settings panel is open (2026-10-09)

What: frame times are kept in a 120-frame window at all times, but the sorted percentiles, draw calls and path-node rate are computed and published only every 30 frames while settings is open.
Why: the readout is for the person tuning the game, and a sort twice a second is pointless work for everyone else. The window is always kept so the numbers are honest the moment the panel opens.

## M6-6 — Lighthouse runs on demand, not as a dependency (2026-10-09)

What: the accessibility and best-practice scores come from `npx lighthouse@12` pointed at `vite preview`, driven by Playwright's own Chromium, and are recorded in plan.md section 5. It is not in package.json.
Why: Lighthouse pulls in a large tree for a check that runs a handful of times a project, and the spec's dependency rule is about keeping the install small. The exact command is in plan.md so anyone can repeat it.

## M6-7 — The action icon is a pixel glyph above the nameplate, with the progress bar in it (2026-10-09)

What: a 16 by 16 glyph for walking, mining, building, following, wandering and reshaping floats above Luciana's name while a job runs, and a two-pixel bar along its bottom fills as she works through a block. It is one extra draw call per kit while she is busy, so the draw-call budget is now visible chunks plus seven per kit plus four overlays.
Why: the spec's MVP asks for a floating icon for the current action, and section 3.8 rule 6 wants mining progress visible. Putting the bar on the icon rather than over the target block keeps it in one place the eye already watches, and avoids a second billboard that would have to find the block from the kit's job.
Rejected: a bar over the target block as well. Nothing stops it being added later; the queue already exposes the progress.

## M7-1 — The saver looks every two seconds rather than listening everywhere (2026-10-09)

What: every forty ticks the game builds a cheap fingerprint (world revision, chat length and last id, Luciana's cell and pockets, the settings) and writes the save only when it differs from the last one. The tab going hidden or away writes at once.
Why: edits come from the player's hand, from Luciana's jobs, from the world-scale powers and from the chat, in four different modules. One polling point in the app layer saves within two seconds of any of them without wiring an event through each, and never writes while nothing changes.
Rejected: a change event on the world plus listeners on chat and settings. More plumbing for the same two-second promise.

## M7-2 — A shared world is a guest until the first change (2026-10-09)

What: opening a share link loads that world for the session. If the browser already holds a save, it is left alone until the player changes something in the shared world, at which point a toast says the save now holds this world.
Why: spec R8's share links would otherwise overwrite a player's own meadow the moment they clicked a friend's link. The first edit is the clearest sign they mean to keep it.

## M7-3 — A save from a newer build is left untouched (2026-10-09)

What: a save whose version is higher than this build's is neither read nor overwritten; the visit runs unsaved with a toast saying so. A document with no version is read as the pre-release v0 shape and brought forward. The v2 reader has a named place in `migrate` and does not exist yet.
Why: the spec asks for a versioned migration stub. Guessing at a newer shape could destroy a save; refusing to write is the only safe default.

## M7-4 — The world keeps a revision counter (2026-10-09)

What: every real block change, load or reseed bumps an integer on the world.
Why: it is what lets the saver skip untouched frames, lets a guest world notice its first edit, and costs one increment.

## M8-1 — Idle remarks are one kit musing, scripted unless the player says otherwise (2026-10-09)

What: with one kit there is no kit-to-kit chatter, so the ambient line is Luciana saying something to herself after thirty to sixty seconds of being left alone, never while busy, and never within five seconds of finishing a job. The first one waits a full gap from the start of the session. A settings switch lets the model write these; off, they come from her templates.
Why: spec R3 and the MVP ask for ambient chatter at one exchange per thirty seconds with the model off by default; this is that rule with the second speaker removed. The scheduler runs on the simulation clock, so it pauses with the tab.

## M8-2 — A power never leaves her inside a block (2026-10-09)

What: after any world-scale power, a kit whose cell or head became solid is stood on the new surface of her column with a short line.
Why: the two-minute soak found her buried by her own raised hill. Powers are instant and area-wide, so the queue is the one place that can check everyone afterwards.

## M8-3 — The bench skips two seconds of warm-up and says so (2026-10-09)

What: `?bench=1` drops the first two seconds from its percentiles, reports the worst warm-up frame separately, and records when its worst steady frame happened.
Why: shader compilation and the first mesh upload land in the first frames on every browser and are start-up cost, not play. R6 is a budget for play. Both numbers are in plan.md section 5 so nothing is hidden.

## M8-4 — The soak runs thirty seconds in CI and two minutes on record (2026-10-09)

What: `e2e/soak.spec.ts` takes its length from `SOAK_SECONDS`, thirty by default; the two-minute run the plan asks for was done on the dev laptop and is recorded in section 5.
Why: two more minutes on every push buys nothing the thirty-second run and the recorded run do not already show, and the deploy waits on CI.

## M8-5 — Firefox and WebKit are opt-in projects (2026-10-09)

What: the boot test runs in Playwright's Firefox and WebKit when `BROWSER_MATRIX` is set; CI installs Chromium alone.
Why: two more browser downloads on every CI run for a boot check that the recorded run already covers. The projects exist so anyone can repeat it in one command.

## M8-6 — Lighthouse, the bench, the litmus capture and the hero recording are tools, not tests (2026-10-09)

What: `tools/measure.mjs`, `tools/litmus.mjs` and `tools/hero.mjs` drive a headed Chromium against `vite preview` on the developer's machine and are run by hand; `tools/check-gif.mjs` is the one that gates, and only on the GIF's size and length.
Why: real-GPU numbers and a readable recording need a real window, which CI does not have. The commands and their dates are in plan.md.

## M8-7 — idb-keyval was removed (2026-10-09)

What: the dependency was installed at M0 as one the spec allows and never used; localStorage covers the save and sessionStorage the key.
Why: an unused package is weight in the lockfile and a question for every reader.

## M9-1 — A kit may fall any height (2026-10-09)

What: the pathfinder's fall limit goes from three blocks to the height of the world, with a small cost per block dropped so she prefers a gentler way down when one exists. Climbing is still one step at a time.
Why: the owner asked her to hop off a hill and she said she could not get there. Falling has no cost to her in this game, so the spec's limit (R4, "fall ≤3") only produced refusals. Amends R4 at the owner's request; R9's "falls ≤3" test becomes "falls any height".
