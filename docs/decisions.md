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
