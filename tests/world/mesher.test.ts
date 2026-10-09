import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/chunks';
import { cornerAo, meshChunk } from '../../src/world/mesher';

function emptyWorld(): World {
  return new World(1);
}

function meshOf(world: World) {
  const chunk = world.chunks[0];
  if (!chunk) throw new Error('no chunk');
  return meshChunk(world, chunk);
}

/**
 * Total visible surface in unit block faces.
 *
 * The spec counts faces, the mesher emits merged quads, and the two differ on
 * purpose: merging is the whole point of greedy meshing. A quad's third corner
 * carries its width and height in block units, so the area is read from there.
 */
function faceArea(mesh: ReturnType<typeof meshOf>): number {
  let area = 0;
  for (let q = 0; q < mesh.quadCount; q++) {
    const corner2 = (q * 4 + 2) * 2;
    area += (mesh.uvs[corner2] ?? 0) * (mesh.uvs[corner2 + 1] ?? 0);
  }
  return area;
}

describe('greedy mesher face counts', () => {
  it('gives a lone block six faces', () => {
    const world = emptyWorld();
    world.set(5, 5, 5, 1);
    const mesh = meshOf(world);
    expect(faceArea(mesh)).toBe(6);
    expect(mesh.quadCount).toBe(6);
  });

  it('gives two adjacent blocks ten faces, merged into six quads', () => {
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]) {
      const world = emptyWorld();
      world.set(5, 5, 5, 1);
      world.set(5 + (dx ?? 0), 5 + (dy ?? 0), 5 + (dz ?? 0), 1);
      const mesh = meshOf(world);
      const where = `offset ${String(dx)},${String(dy)},${String(dz)}`;
      // Twelve block faces, two hidden at the shared boundary.
      expect(faceArea(mesh), where).toBe(10);
      // Four of the ten merge in pairs along the shared axis.
      expect(mesh.quadCount, where).toBe(6);
    }
  });

  it('gives a fully enclosed block no faces of its own', () => {
    const world = emptyWorld();
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        for (let z = 4; z <= 6; z++) world.set(x, y, z, 1);
      }
    }
    const solid = meshOf(world);
    // Six sides of three by three, and nothing from the buried centre.
    expect(faceArea(solid)).toBe(54);
    expect(solid.quadCount).toBe(6);

    // Carving the centre out adds an interior cavity, proving the buried block
    // really was contributing nothing before.
    const hollow = emptyWorld();
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        for (let z = 4; z <= 6; z++) {
          if (x === 5 && y === 5 && z === 5) continue;
          hollow.set(x, y, z, 1);
        }
      }
    }
    expect(faceArea(meshOf(hollow))).toBe(54 + 6);
  });

  it('emits nothing for an empty chunk', () => {
    expect(meshOf(emptyWorld()).quadCount).toBe(0);
  });

  it('merges a flat slab into one quad per side', () => {
    const world = emptyWorld();
    for (let x = 0; x < 4; x++) {
      for (let z = 0; z < 4; z++) world.set(x, 0, z, 1);
    }
    // Top and bottom merge to one quad each; the four sides merge to one each.
    const mesh = meshOf(world);
    expect(mesh.quadCount).toBe(6);
    expect(faceArea(mesh)).toBe(16 + 16 + 4 * 4);
  });

  it('does not merge faces whose shading differs', () => {
    const world = emptyWorld();
    for (let x = 0; x < 4; x++) {
      for (let z = 0; z < 4; z++) world.set(x, 0, z, 1);
    }
    // A block sitting on one end darkens the corners beneath it, so the top
    // face can no longer be a single quad.
    world.set(0, 1, 0, 1);
    expect(meshOf(world).quadCount).toBeGreaterThan(6);
  });
});

describe('ambient occlusion', () => {
  it('follows the three-neighbour rule', () => {
    expect(cornerAo(false, false, false)).toBe(3);
    expect(cornerAo(false, false, true)).toBe(2);
    expect(cornerAo(true, false, false)).toBe(2);
    expect(cornerAo(false, true, false)).toBe(2);
    expect(cornerAo(true, false, true)).toBe(1);
    expect(cornerAo(false, true, true)).toBe(1);
    // Two solid sides close the corner completely; the diagonal cannot help.
    expect(cornerAo(true, true, false)).toBe(0);
    expect(cornerAo(true, true, true)).toBe(0);
  });

  it('darkens exactly the corners it should on a known configuration', () => {
    // A block at (5,5,5) with a second block resting diagonally above it at
    // (6,6,5). Ambient occlusion for a top face samples the layer above, so
    // only that layer matters: a block beside it at the same height occludes
    // nothing. The two corners on the +x edge each see one solid side and no
    // solid diagonal, giving 3 - 1 = 2; the other two stay fully open at 3.
    const world = emptyWorld();
    world.set(5, 5, 5, 1);
    world.set(6, 6, 5, 1);

    const mesh = meshOf(world);
    const topAo: number[] = [];
    for (let q = 0; q < mesh.quadCount; q++) {
      const v = q * 4;
      if (mesh.normals[v * 3 + 1] !== 1) continue;
      // Only the top face of the block at x = 5.
      const x0 = mesh.positions[v * 3] ?? 0;
      if (x0 !== 5) continue;
      for (let c = 0; c < 4; c++) topAo.push(mesh.ao[v + c] ?? -1);
    }

    expect(topAo).toHaveLength(4);
    expect(topAo.filter((a) => a === 3)).toHaveLength(2);
    expect(topAo.filter((a) => a === 2)).toHaveLength(2);
    expect(topAo.filter((a) => a < 2)).toHaveLength(0);
  });

  it('fully darkens a corner wedged between two solid sides', () => {
    // Both neighbours sit in the layer above the top face, one along +x and
    // one along +z, so the corner between them is closed on both sides and
    // reads 0 whatever the diagonal does.
    const world = emptyWorld();
    world.set(5, 5, 5, 1);
    world.set(6, 6, 5, 1);
    world.set(5, 6, 6, 1);

    const mesh = meshOf(world);
    let darkest = 3;
    for (let q = 0; q < mesh.quadCount; q++) {
      const v = q * 4;
      if (mesh.normals[v * 3 + 1] !== 1) continue;
      if ((mesh.positions[v * 3] ?? 0) !== 5) continue;
      if ((mesh.positions[v * 3 + 2] ?? 0) !== 5) continue;
      for (let c = 0; c < 4; c++) darkest = Math.min(darkest, mesh.ao[v + c] ?? 3);
    }
    expect(darkest).toBe(0);
  });
});

describe('mesh integrity', () => {
  it('keeps every array in step and every index in range', () => {
    const world = emptyWorld();
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        for (let y = 0; y < 3; y++) world.set(x, y, z, ((x + y + z) % 8) + 1);
      }
    }
    const mesh = meshOf(world);
    const vertices = mesh.quadCount * 4;

    expect(mesh.positions.length).toBe(vertices * 3);
    expect(mesh.normals.length).toBe(vertices * 3);
    expect(mesh.uvs.length).toBe(vertices * 2);
    expect(mesh.layers.length).toBe(vertices);
    expect(mesh.ao.length).toBe(vertices);
    expect(mesh.indices.length).toBe(mesh.quadCount * 6);

    for (const index of mesh.indices) expect(index).toBeLessThan(vertices);
    for (const value of mesh.ao) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of mesh.ao) expect(value).toBeLessThanOrEqual(3);
  });

  it('points every normal outward from the solid block', () => {
    const world = emptyWorld();
    world.set(5, 5, 5, 1);
    const mesh = meshOf(world);

    for (let q = 0; q < mesh.quadCount; q++) {
      const v = q * 4;
      const nx = mesh.normals[v * 3] ?? 0;
      const ny = mesh.normals[v * 3 + 1] ?? 0;
      const nz = mesh.normals[v * 3 + 2] ?? 0;
      // Centre of the quad.
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let c = 0; c < 4; c++) {
        cx += (mesh.positions[(v + c) * 3] ?? 0) / 4;
        cy += (mesh.positions[(v + c) * 3 + 1] ?? 0) / 4;
        cz += (mesh.positions[(v + c) * 3 + 2] ?? 0) / 4;
      }
      // Stepping along the normal from the face centre must leave the block,
      // and stepping back must land inside it.
      const outside = world.get(
        Math.floor(cx + nx * 0.5),
        Math.floor(cy + ny * 0.5),
        Math.floor(cz + nz * 0.5),
      );
      const inside = world.get(
        Math.floor(cx - nx * 0.5),
        Math.floor(cy - ny * 0.5),
        Math.floor(cz - nz * 0.5),
      );
      expect(outside).toBe(0);
      expect(inside).toBe(1);
    }
  });

  it('winds every triangle so the face is seen from outside', () => {
    const world = emptyWorld();
    world.set(5, 5, 5, 1);
    const mesh = meshOf(world);

    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [ia, ib, ic] = [
        mesh.indices[t] ?? 0,
        mesh.indices[t + 1] ?? 0,
        mesh.indices[t + 2] ?? 0,
      ];
      const p = (i: number): [number, number, number] => [
        mesh.positions[i * 3] ?? 0,
        mesh.positions[i * 3 + 1] ?? 0,
        mesh.positions[i * 3 + 2] ?? 0,
      ];
      const [ax, ay, az] = p(ia);
      const [bx, by, bz] = p(ib);
      const [cx, cy, cz] = p(ic);
      const e1 = [bx - ax, by - ay, bz - az] as const;
      const e2 = [cx - ax, cy - ay, cz - az] as const;
      const cross: [number, number, number] = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const n: [number, number, number] = [
        mesh.normals[ia * 3] ?? 0,
        mesh.normals[ia * 3 + 1] ?? 0,
        mesh.normals[ia * 3 + 2] ?? 0,
      ];
      const dot = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2];
      expect(dot, `triangle ${String(t / 3)} is wound inside out`).toBeGreaterThan(0);
    }
  });
});
