# Daniblox — architecture

One page, one kit, no server. Everything below runs in the browser from a
static build on GitHub Pages.

```
                 player
                   │  types, clicks, taps
                   ▼
        ┌──────────────────────┐    signals     ┌──────────────────────┐
        │  src/ui  (Preact)    │◄──────────────►│  src/app             │
        │  panel · palette     │                │  bootstrap · game    │
        │  menu · welcome      │                │  loop 20 Hz · saves  │
        │  settings · toasts   │                │  session · share     │
        └──────────────────────┘                └──────┬───────────────┘
                                                       │ owns the clock,
                 never imported by the four below      │ wires everything
        ┌──────────────┬──────────────┬────────────────┼──────────────┐
        ▼              ▼              ▼                ▼              │
  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐       │
  │ src/brain │  │ src/folk  │  │ src/world │  │ src/render   │       │
  │ parser    │  │ kit       │  │ chunks    │  │ scene · sky  │       │
  │ scripted  │─►│ queue     │─►│ blocks    │◄─│ mesher glue  │       │
  │ llm       │  │ A* paths  │  │ powers    │  │ camera · kit │       │
  │ schema ✓  │  │           │  │ terrain   │  │ atlas        │       │
  └───────────┘  └───────────┘  └───────────┘  └──────────────┘       │
        ▲                                                             │
        │ src/chat: Luciana's card, dialogue templates, idle timing ──┘
```

## The one rule

`src/world`, `src/render`, `src/folk` and `src/brain` never import from
`src/ui`. ESLint enforces it and a committed negative fixture proves the rule
fires. The interface reads state through `@preact/signals` in `src/ui/state.ts`
and raises intents through callback signals; `src/app` is the only place that
knows both sides.

## A command, end to end

1. Text arrives from the panel's box, the palette, the welcome, or the block
   menu. All of them call the same `onCommand`.
2. `src/app/game.ts` builds a `BrainRequest`: the text, the reticle cell, the
   pointed-at block, the time of day, and the last six turns.
3. A brain answers. `ScriptedBrain` parses the grammar in
   `src/brain/parser.ts` and speaks through `src/chat/dialogue.ts`; `LlmBrain`
   posts to the configured endpoint with a prompt under 600 tokens and the
   player's words wrapped as data.
4. Whatever came back passes `validate()` in `src/brain/schema.ts`: a closed
   union of twelve action shapes, strict at every level, with world-bounded
   coordinates. Nothing else can execute. A model reply that fails is asked
   for once more, then the scripted brain takes the turn and a badge says so.
5. The actions go on Luciana's `ActionQueue` in `src/folk/actions.ts`. Small
   jobs run over ticks: path there (time-sliced A* in `src/folk/pathfinding.ts`,
   two milliseconds a frame, four thousand nodes at most), work for twelve
   ticks, take or place the block. World-scale powers in `src/world/powers.ts`
   land in one tick. Every outcome is reported back as a note the game turns
   into a line in her voice.
6. Changed chunks are marked dirty; `src/render/chunkMeshes.ts` remeshes at
   most one per frame with the greedy mesher and per-vertex ambient occlusion
   in `src/world/mesher.ts`.

## Time

`src/app/loop.ts` runs the simulation at a fixed 20 Hz with an accumulator
and clamps a frame to a quarter second of simulated time. It owns the
day-night clock; the renderer only samples it. A hidden tab pauses the loop,
and resuming resets the accumulator, so a tab left open for an hour comes
back to a world that waited. Rendering interpolates Luciana between ticks.

## The world

64 by 64 by 32 blocks in sixteen chunks of 16 by 16 by 32, each a flat
`Uint8Array` ordered in horizontal slabs so run-length coding compresses it
hard. Eight block ids. Terrain is simplex noise seeded by one integer, so a
seed alone recreates a meadow; edits are a difference against that.

## Saving and sharing

`src/app/persistence.ts` is one zod-checked document under `daniblox:v1`:
seed, voxels as run-length base64, Luciana's cell and pockets, fifty chat
lines, settings. Never the key; the type has no field for it and a document
carrying one is refused. `src/app/session.ts` decides what a visit starts
from: a share link, then the save, then a fresh meadow, with a sentence for
each failure. The saver in `game.ts` fingerprints the state every two seconds
and writes on change, and at once when the tab is hidden or closed.

## Rendering

Three.js with one custom GLSL3 material for terrain: a 2D array texture of
16 px tiles sampled nearest, vertex ambient occlusion, a hemisphere fill
tinted from the sky, a single multiply tint for night, and an unlit branch
for the gem. Luciana is primitives baked into three meshes with vertex
colours, plus a face plane, a nameplate, a shadow disc and an action icon:
seven draw calls when busy. Chunks outside the frustum, or past the render
distance, are skipped before the draw.

## Tests

Unit tests in `tests/` mirror `src/` and run in Node with Vitest. Browser
tests in `e2e/` run Playwright against the production build with WebGL on
SwiftShader; a second project disables WebGL and checks the fallback screen.
Every browser test fails on any console error or unhandled rejection. CI
runs lint, unit, build, size, e2e and audit, deploys to Pages on main, and
runs the same browser suite once more against the live site.
