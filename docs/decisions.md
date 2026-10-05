# Decisions

One entry per non-obvious choice: what, why, what was rejected. Five lines or fewer each, newest last. Keep this file current (see CLAUDE.md).

## P1-1 — Keep the name "Voxelfolk" (2026-10-04)
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
