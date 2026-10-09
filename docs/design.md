# Daniblox — design

The visual identity, as built. The direction and its reasoning are in
docs/plan.md section 3; this is the record of what shipped and how each
piece stays its own thing.

## Name and wordmark

**Daniblox**, set in Press Start 2P, uppercase, wide-tracked, cream on a
gem-pink slab with a thick ink border and a hard two-pixel drop shadow. The
"O" is a pixel gem with a four-point sparkle; that gem alone is the favicon
and the handle on the phone sheet. It is real text in the display face, not
an SVG of letters, so assistive technology reads one word and the font is
genuinely exercised on every load.

How it differs: the genre-defining block game sets its name in a bevelled
stone face with a 3D extrusion. This is a flat cartridge-era title slab with
no gradient, no bevel and no extrusion.

## Palette

| Swatch   | Hex       | Role                                     |
| -------- | --------- | ---------------------------------------- |
| Crumb    | `#e6a0a4` | ground: rose clay, pink even in shadow   |
| Clover   | `#86cf6c` | grass-topped ground, white flower pixels |
| Pebble   | `#c3c7d6` | stone: lavender grey                     |
| Shell    | `#f6e4c3` | sand: pale cream                         |
| Bark     | `#9c6243` | log: cocoa trunk, the one brown          |
| Sprout   | `#3fae7f` | leaves: teal green with berry dots       |
| Tile     | `#4f8fd8` | building block: painted cornflower       |
| Gem      | `#ff5fa2` | accent: candy pink, unlit at night       |
| Sky Day  | `#8fd6f0` | zenith by day                            |
| Sky Dusk | `#f3a97e` | dusk horizon                             |
| Cream    | `#fdf3e2` | light background, day horizon            |
| Plum     | `#221d33` | dark background, night zenith            |
| Ink      | `#332a4a` | light text and every outline             |

Every block is at least 60 apart in RGB distance from every other, and the
atlas generator refuses any block whose base, shaded or night-tinted colour
lands in the brown band, with Bark as the single whitelisted trunk. The
shading check is what guarantees that no cube ever reads as green over
brown.

How it differs: no dirt brown under grass green, no grey cobble, no oak
yellow. Stone is lavender, sand is cream, the building block is blue and the
accent is pink. The sky is a three-stop gradient with no sun or moon sprite
in v1.

## Themes

Two themes from one token file, `src/ui/tokens.css`. Light is the default;
dark follows the system unless the player picks one in settings, which sets
a document attribute. A unit test reads the file and checks every text and
border pair against WCAG AA in both themes, so these numbers cannot drift
from the CSS:

| Pair                 | Light   | Dark    | Needs |
| -------------------- | ------- | ------- | ----- |
| text on background   | 12.2 :1 | 14.0 :1 | 4.5   |
| muted on background  | 6.3 :1  | 7.9 :1  | 4.5   |
| accent on background | 4.9 :1  | 7.7 :1  | 4.5   |
| label on accent      | 4.9 :1  | 7.7 :1  | 4.5   |
| border on background | 3.4 :1  | 4.1 :1  | 3     |

Button labels are the background colour on the accent, never white, because
white on this pink fails.

## Type

Press Start 2P for the wordmark, panel headings and the kit's name, at 10 px
and up with generous tracking; Pixelify Sans for everything else at 16 px for
body and chat, 600 for labels, 700 for buttons. Both are self-hosted
Latin-subset woff2 files with their SIL OFL licences beside them, under 100
KB together.

The readability escape hatch from the plan was tried and not taken: chat
lines in Pixelify Sans at 16 px read comfortably in both themes across a few
hundred lines, so pixel type stays everywhere (decisions.md M6-4).

How it differs: the block game's lettering is a thick bitmap face with a
hard shadow on grey panels. These two faces are arcade and interface pixel
type on pink and plum panels with ink borders.

## Blocks

Sixteen-pixel tiles drawn by a generator from declarative recipes, with a
soft top light and bottom shade inside the fill rather than a bevel pair, at
most six colours each, and a pattern vocabulary of flower pixels, speckles,
pebble lumps, berry dots, grain lines, highlights, corner notches and
sparkles. No pattern touches two opposite edges, so greedy-meshed repeats
never seam. There is no black grid line on any terrain tile.

How it differs: no noise-dirt, no cobble cells, no log rings, no brick
courses, no bevel highlights, no grid outline.

## Luciana

One kit for now, built from primitives and baked into three meshes: a
rounded body, a larger head with tall pointed ears, stubby arms, feet and a
curved tail, in a pure white coat with ink over the crown, ears, saddle and
tail. The face is the single pixel-art part: big eyes with a shine dot, a
tiny mouth, two blush pixels, and blink frames in one strip. A flat shadow
disc squashes on every landing.

How it differs: a chibi upright cat with a large expressive face shares
nothing with a boxy quadruped or a blocky humanoid, and her coat uses only
the palette's own white and ink.

## Interface

A calm sidebar on the right: Luciana's card, the chat thread, one command
box, and a settings panel. A command palette on Ctrl or Cmd and K. On a
phone the sidebar is a sheet along the bottom with a gem handle. Toasts are
plain bordered lines. Everything is reachable from the keyboard and every
control is at least 44 px.

Feedback in the world: the hovered face gets a bright animated dashed pixel
border on that one face; the orbit point is a pale ring on the ground; a
block leaving or arriving does a 120 ms squash. Clicking a block opens a
small menu of what Luciana can do with it and what the player can do
themselves.

How it differs: no hotbar, no hearts, no hunger bar, no crosshair, no
wireframe cube around a block, no crack stages, no cubic debris and no
dropped-item entities.

## Sky and light

A warm key light, hemisphere fill tinted from the current sky, vertex
ambient occlusion at a gentle strength, and night as one multiply tint so
light intensities never change and the gem stays bright after dark. Fog
matches the horizon and pulls in with the render distance so the near
setting reads as haze rather than a cliff edge.

## Motion

Camera easing, the kit's bob, blink and tail sway, and the dashed border's
march all switch off under reduced motion, whether the system asks for it
or the player does in settings.
