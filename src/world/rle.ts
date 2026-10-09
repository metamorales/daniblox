/**
 * Run-length encoding for voxel chunk storage (spec R8).
 *
 * Encoded form is a flat byte stream of (count, value) pairs where count is
 * 1..255, so a run longer than 255 is split across pairs. Chunks are mostly
 * long runs of air or stone, which this compresses hard, and the pair stream
 * base64s cleanly into localStorage.
 */

const MAX_RUN = 255;

export function rleEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < data.length) {
    const value = data[index] as number;
    let run = 1;
    while (index + run < data.length && data[index + run] === value && run < MAX_RUN) run++;
    out.push(run, value);
    index += run;
  }
  return Uint8Array.from(out);
}

export function rleDecode(encoded: Uint8Array): Uint8Array {
  if (encoded.length % 2 !== 0) {
    throw new Error(`RLE stream must be an even number of bytes, got ${encoded.length}`);
  }
  let total = 0;
  for (let i = 0; i < encoded.length; i += 2) total += encoded[i] as number;

  const out = new Uint8Array(total);
  let cursor = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    const run = encoded[i] as number;
    const value = encoded[i + 1] as number;
    if (run === 0) throw new Error(`RLE run length at byte ${i} is zero`);
    out.fill(value, cursor, cursor + run);
    cursor += run;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
