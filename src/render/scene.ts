/**
 * The render side of the world: terrain meshes, sky, camera and the draw step.
 *
 * This module owns nothing about simulation. The clock lives in src/app/loop
 * and this only samples it.
 */
import { Group, Scene, WebGLRenderer } from 'three';
import { LAYER } from '../world/blocks';
import { WORLD_X, WORLD_Y, WORLD_Z, World } from '../world/chunks';
import { generate } from '../world/terrain';
import { Kit } from '../folk/kit';
import { KitMesh } from './kitMesh';
import { loadAtlas } from './atlas';
import { ChunkMeshes } from './chunkMeshes';
import { Interaction, type BlockChange, type BlockPick } from './interaction';
import { OrbitCamera } from './orbitCamera';
import { Sky, skyAt } from './sky';
import { VoxelMaterial } from './voxelMaterial';

export interface PerfSnapshot {
  frameMs: number;
  drawCalls: number;
  triangles: number;
  visibleChunks: number;
  totalChunks: number;
  remeshMs: number;
  pendingChunks: number;
}

export interface ViewEvents {
  /** A click or long press on a block. The app decides what to offer. */
  onPick?(pick: BlockPick): void;
  /** The player changed a block by hand. */
  onEdit?(change: BlockChange): void;
}

export interface WorldView {
  readonly world: World;
  readonly orbit: OrbitCamera;
  readonly perf: PerfSnapshot;
  /** Luciana. A roster of one today; the shape allows more later. */
  readonly kits: readonly Kit[];
  /** One simulation step, driven by the fixed-step loop. */
  tick(): void;
  /** Send a kit to a cell. */
  sendTo(kitId: string, cell: { x: number; y: number; z: number }): void;
  /** The block under the pointer, which is what "this" means in a command. */
  pointedAt(): { x: number; y: number; z: number } | null;
  /** The player's own edit, with the squash effect. False when nothing changed. */
  editBlock(x: number, y: number, z: number, id: number): boolean;
  /** Frames drawn since start. The e2e suite reads this to prove the loop runs. */
  frames: number;
  render(dayPhase: number, frameMs: number, alpha?: number): void;
  resize(): void;
  dispose(): void;
}

export async function createWorldView(
  canvas: HTMLCanvasElement,
  atlasUrl: string,
  seed: number,
  events: ViewEvents = {},
): Promise<WorldView> {
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  const sky = new Sky();
  scene.add(sky.mesh);

  const world = new World(seed);
  generate(world);

  const { texture } = await loadAtlas(atlasUrl);
  const material = new VoxelMaterial({ tiles: texture, unlitLayer: LAYER.gem });
  const chunks = new ChunkMeshes(world, material);
  scene.add(chunks.group);
  const initialMeshMs = chunks.rebuildAll();

  const orbit = new OrbitCamera(canvas, { minX: 0, maxX: WORLD_X, minZ: 0, maxZ: WORLD_Z });
  orbit.setTarget(WORLD_X / 2, WORLD_Y * 0.42, WORLD_Z / 2);

  // Luciana starts on the surface at the middle of the meadow.
  const spawnX = Math.floor(WORLD_X / 2);
  const spawnZ = Math.floor(WORLD_Z / 2);
  const luciana = new Kit({
    id: 'luciana',
    name: 'Luciana',
    appearance: { coat: '#ffffff', patch: '#2b2436' },
    at: { x: spawnX, y: world.surfaceHeight(spawnX, spawnZ) + 1, z: spawnZ },
  });
  const kits = [luciana];
  const kitMeshes = kits.map((kit) => new KitMesh(kit));
  for (const mesh of kitMeshes) scene.add(mesh.group);

  const effects = new Group();
  effects.name = 'effects';
  scene.add(effects);

  const interaction = new Interaction(canvas, world, orbit.camera, chunks.group, effects, {
    onPick: events.onPick,
    onEdit: events.onEdit,
  });
  scene.add(interaction.reticle);
  scene.add(interaction.decal);

  const perf: PerfSnapshot = {
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    visibleChunks: 0,
    totalChunks: world.chunks.length,
    remeshMs: initialMeshMs,
    pendingChunks: 0,
  };

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    orbit.resize(width, height);
  }
  resize();
  window.addEventListener('resize', resize);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const view: WorldView = {
    world,
    orbit,
    perf,
    kits,
    frames: 0,

    tick(): void {
      for (const kit of kits) kit.tick(world);
    },

    sendTo(kitId, cell): void {
      kits.find((kit) => kit.id === kitId)?.goTo(world, cell);
    },

    pointedAt(): { x: number; y: number; z: number } | null {
      const target = interaction.target;
      return target ? { x: target.x, y: target.y, z: target.z } : null;
    },

    editBlock(x, y, z, id): boolean {
      return interaction.setBlock(x, y, z, id);
    },

    render(dayPhase: number, frameMs: number, alpha = 1): void {
      const palette = skyAt(dayPhase);
      sky.apply(palette);
      material.setNightTint(palette.tint);
      material.setSkyColours(palette.zenith, palette.horizon);
      for (const mesh of kitMeshes) {
        mesh.setNightTint(palette.tint);
        mesh.setSkyColours(palette.zenith, palette.horizon);
        mesh.update(frameMs, alpha, orbit.camera.position, reducedMotion.matches);
      }

      orbit.update(frameMs);
      // The sky rides with the camera, so its gradient never clips or moves.
      sky.mesh.position.copy(orbit.camera.position);

      // The reticle marks the cell the camera orbits, resting on the ground
      // there. This is the cell that "here" and "me" will refer to.
      const cell = orbit.targetCell();
      interaction.placeReticle(cell.x, cell.z, world.surfaceHeight(cell.x, cell.z));
      interaction.update(frameMs);

      const remesh = chunks.update();
      const visible = chunks.cull(orbit.camera);
      renderer.render(scene, orbit.camera);

      perf.frameMs = frameMs;
      perf.drawCalls = renderer.info.render.calls;
      perf.triangles = renderer.info.render.triangles;
      perf.visibleChunks = visible;
      perf.remeshMs = remesh.milliseconds;
      perf.pendingChunks = remesh.pending;
      view.frames++;
    },

    resize,

    dispose(): void {
      window.removeEventListener('resize', resize);
      for (const mesh of kitMeshes) mesh.dispose();
      interaction.dispose();
      orbit.dispose();
      chunks.dispose();
      sky.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
    },
  };

  return view;
}
