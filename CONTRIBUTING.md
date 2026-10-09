# Contributing

Thanks for looking. Daniblox is small on purpose, so the bar for a change is
that it keeps the thing finished.

## Before a change

Read `docs/SPEC.md`; it is the source of truth and the rest of the docs
never override it. Then `docs/decisions.md`, so you do not reopen a choice
that was made and recorded.

## The rules that lint enforces

- `src/world`, `src/render`, `src/folk` and `src/brain` never import from
  `src/ui`. The interface reads state through signals.
- Nothing a brain says executes. Every reply, scripted or model, passes
  `validate()` in `src/brain/schema.ts` before it can touch the world.
- The API key lives in memory, or in sessionStorage when the player asks.
  Never in localStorage, the save file, a share link, a log or the bundle.
- The originality word list in `tools/check-words.mjs` applies to every file
  except `docs/SPEC.md`.
- Every folder named in the spec layout keeps a README of at most five lines.
- New dependencies: zod and simplex-noise are allowed; anything else must be
  under 20 KB gzipped and explained in `docs/decisions.md`.

## Running things

```bash
npm run dev        # the game, with reload
npm test           # unit tests
npm run e2e        # browser tests (install Chromium once: npx playwright install chromium)
npm run lint       # words, READMEs, import boundary, eslint, prettier
npm run build      # type check and bundle; npm run size checks the budget
```

A pull request should leave all of those green. If a change needs a new
decision, add an entry to `docs/decisions.md` in the same pull request:
what, why, what was rejected, five lines at most.

## Commits

Conventional commits: `feat(folk): ...`, `fix(render): ...`,
`docs(plan): ...`. One change per commit, described in the body in plain
sentences.
