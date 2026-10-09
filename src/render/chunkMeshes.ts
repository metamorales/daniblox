/**
 * One Three.js mesh per chunk, rebuilt from the greedy mesher.
 *
 * At most one chunk is remeshed per frame (spec R6), so a burst of edits
 * spreads its cost instead of dropping a frame. Each mesh carries a bounding
 * sphere, which is what lets the renderer cull chunks outside the view.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  Sphere,
  Vector3,
} from 'three';
import type { Camera } from 'three';
import type { Material } from 'three';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, type Chunk, World } from '../world/chunks';
import { meshChunk } from '../world/mesher';

export interface RemeshReport {
  /** Chunks remeshed this frame. Never more than one. */
  readonly remeshed: number;
  /** Chunks still waiting. */
  readonly pending: number;
  /** Milliseconds spent in the mesher this frame. */
  readonly milliseconds: number;
}

export class ChunkMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<number, Mesh>();
  private readonly scratch: Uint8Array;
  private lastMilliseconds = 0;
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  /** World-space bounds per chunk, so culling never depends on matrix updates. */
  private readonly bounds = new Map<number, Sphere>();

  constructor(
    private readonly world: World,
    private readonly material: Material,
  ) {
    this.group.name = 'chunks';
    this.scratch = new Uint8Array((CHUNK_X + 2) * (CHUNK_Y + 2) * (CHUNK_Z + 2));
  }

  /** Remesh at most one dirty chunk. Call once per frame. */
  update(): RemeshReport {
    let pending = 0;
    let target: Chunk | undefined;
    for (const chunk of this.world.chunks) {
      if (!chunk.dirty) continue;
      pending++;
      target ??= chunk;
    }
    if (!target) return { remeshed: 0, pending: 0, milliseconds: 0 };

    const started = performance.now();
    this.rebuild(target);
    target.dirty = false;
    this.lastMilliseconds = performance.now() - started;

    return { remeshed: 1, pending: pending - 1, milliseconds: this.lastMilliseconds };
  }

  /** Remesh everything now. Used once at startup, never in the frame loop. */
  rebuildAll(): number {
    const started = performance.now();
    for (const chunk of this.world.chunks) {
      this.rebuild(chunk);
      chunk.dirty = false;
    }
    return performance.now() - started;
  }

  /**
   * Hide chunks outside the view before drawing, and report how many are left.
   *
   * Three.js would cull these itself, but doing it here means the number the
   * perf panel reports is the number actually drawn rather than the number of
   * meshes that exist.
   */
  cull(camera: Camera): number {
    camera.updateMatrixWorld();
    // The renderer refreshes this during render, which is after this runs, so
    // culling against it would always be one frame behind.
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);

    let visible = 0;
    for (const [key, mesh] of this.meshes) {
      const sphere = this.bounds.get(key);
      mesh.visible = sphere ? this.frustum.intersectsSphere(sphere) : true;
      if (mesh.visible) visible++;
    }
    return visible;
  }

  private rebuild(chunk: Chunk): void {
    const key = World.chunkIndex(chunk.cx, chunk.cz);
    const data = meshChunk(this.world, chunk, this.scratch);

    let mesh = this.meshes.get(key);
    if (data.quadCount === 0) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
        this.bounds.delete(key);
      }
      return;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(data.uvs, 2));
    geometry.setAttribute('aLayer', new BufferAttribute(data.layers, 1));
    geometry.setAttribute('aAo', new BufferAttribute(data.ao, 1));
    geometry.setIndex(new BufferAttribute(data.indices, 1));

    // A chunk never changes size, so its bounds are known without measuring.
    const radius = Math.sqrt(CHUNK_X ** 2 + CHUNK_Y ** 2 + CHUNK_Z ** 2) / 2;
    geometry.boundingSphere = new Sphere(
      new Vector3(CHUNK_X / 2, CHUNK_Y / 2, CHUNK_Z / 2),
      radius,
    );
    this.bounds.set(
      key,
      new Sphere(
        new Vector3(
          chunk.cx * CHUNK_X + CHUNK_X / 2,
          CHUNK_Y / 2,
          chunk.cz * CHUNK_Z + CHUNK_Z / 2,
        ),
        radius,
      ),
    );

    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      return;
    }

    mesh = new Mesh(geometry, this.material);
    mesh.name = `chunk-${String(chunk.cx)}-${String(chunk.cz)}`;
    mesh.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
    this.meshes.set(key, mesh);
    this.group.add(mesh);
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
    this.bounds.clear();
  }
}
