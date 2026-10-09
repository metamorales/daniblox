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
