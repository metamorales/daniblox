/**
 * Loads public/atlas/atlas.png into a WebGL2 array texture.
 *
 * The atlas is a vertical strip of 16 px tiles. An array texture, rather than
 * a packed sheet with hand-computed coordinates, is what lets a greedy-merged
 * quad tile itself with hardware repeat: the surface coordinate runs 0..width
 * in block units and wrapping does the rest, with no bleeding between
 * neighbouring tiles at any mip level.
 */
import { DataArrayTexture, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping } from 'three';

export const TILE_SIZE = 16;

export interface AtlasTexture {
  readonly texture: DataArrayTexture;
  readonly layers: number;
}

function decode(image: ImageBitmap): { data: Uint8Array<ArrayBuffer>; layers: number } {
  if (image.width !== TILE_SIZE || image.height % TILE_SIZE !== 0) {
    throw new Error(
      `Atlas must be ${String(TILE_SIZE)} px wide and a whole number of tiles tall, got ${String(image.width)}x${String(image.height)}`,
    );
  }
  const layers = image.height / TILE_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not read the atlas: no 2D canvas context.');
  context.drawImage(image, 0, 0);
  const source = context.getImageData(0, 0, image.width, image.height).data;

  // A texture's first row is its bottom row, so each layer is flipped as it is
  // copied. Authoring stays top-down, which is how anyone editing the art
  // expects it to read.
  const rowBytes = TILE_SIZE * 4;
  // Backed by an explicit ArrayBuffer: Three.js will not accept a view that
  // might be over shared memory.
  const data = new Uint8Array(new ArrayBuffer(source.length));
  for (let layer = 0; layer < layers; layer++) {
    for (let row = 0; row < TILE_SIZE; row++) {
      const from = (layer * TILE_SIZE + row) * rowBytes;
      const to = (layer * TILE_SIZE + (TILE_SIZE - 1 - row)) * rowBytes;
      data.set(source.subarray(from, from + rowBytes), to);
    }
  }
  return { data, layers };
}

export async function loadAtlas(url: string): Promise<AtlasTexture> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch the atlas: HTTP ${String(response.status)}`);
  const image = await createImageBitmap(await response.blob());
  const { data, layers } = decode(image);
  image.close();

  const texture = new DataArrayTexture(data, TILE_SIZE, TILE_SIZE, layers);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  // Crisp up close, mipmapped at distance, which is what keeps a hillside of
  // 16 px tiles from fizzing as the camera pulls back.
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return { texture, layers };
}
