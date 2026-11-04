/**
 * GBA BIOS-compatible LZ77 (type 0x10) codec.
 *
 * Layout: header `0x10 | (size << 8)` followed by blocks of one flag byte and
 * eight tokens. A set flag bit means a back-reference of two bytes:
 * `(len - 3) << 12 | (distance - 1)`; a clear bit is a literal byte.
 */

export interface DecompressResult {
  data: Uint8Array;
  /** Number of compressed bytes consumed, including the 4 byte header. */
  compressedLength: number;
}

const MIN_MATCH = 3;
const MAX_MATCH = 18;
const WINDOW = 0x1000;

export function isLz77(src: Uint8Array, offset: number): boolean {
  return src[offset] === 0x10;
}

export function lz77DecompressedSize(src: Uint8Array, offset: number): number {
  return src[offset + 1] | (src[offset + 2] << 8) | (src[offset + 3] << 16);
}

export function decompressLz77(src: Uint8Array, offset: number): DecompressResult {
  if (src[offset] !== 0x10) throw new Error(`No LZ77 data at 0x${offset.toString(16)}`);
  const size = lz77DecompressedSize(src, offset);
  const out = new Uint8Array(size);
  let pos = offset + 4;
  let written = 0;

  while (written < size) {
    if (pos >= src.length) throw new Error('LZ77 stream ended unexpectedly');
    let flags = src[pos++];
    for (let i = 0; i < 8 && written < size; i++, flags <<= 1) {
      if ((flags & 0x80) === 0) {
        out[written++] = src[pos++];
        continue;
      }
      const b1 = src[pos++];
      const b2 = src[pos++];
      const length = (b1 >> 4) + MIN_MATCH;
      const distance = (((b1 & 0xf) << 8) | b2) + 1;
      if (distance > written) throw new Error('LZ77 back-reference before start of data');
      for (let j = 0; j < length && written < size; j++) {
        out[written] = out[written - distance];
        written++;
      }
    }
  }
  return { data: out, compressedLength: pos - offset };
}

/**
 * Compresses with a greedy longest-match search using hash chains over
 * 3-byte prefixes. Distances of 1 are avoided because the VRAM-safe BIOS
 * routine (used for direct-to-VRAM loads) cannot handle them.
 */
export function compressLz77(input: Uint8Array): Uint8Array {
  const n = input.length;
  const out: number[] = [0x10, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

  const HASH_SIZE = 1 << 14;
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const hashAt = (i: number) =>
    (((input[i] << 10) ^ (input[i + 1] << 5) ^ input[i + 2]) >>> 0) & (HASH_SIZE - 1);
  let hashed = 0;
  const insertUpTo = (end: number) => {
    for (; hashed < end && hashed + 2 < n; hashed++) {
      const h = hashAt(hashed);
      prev[hashed] = head[h];
      head[h] = hashed;
    }
  };

  let src = 0;
  while (src < n) {
    const flagIndex = out.length;
    out.push(0);
    for (let bit = 0; bit < 8 && src < n; bit++) {
      insertUpTo(src);
      let bestLen = 0;
      let bestDist = 0;
      if (src + MIN_MATCH <= n) {
        const maxLen = Math.min(MAX_MATCH, n - src);
        let candidate = head[hashAt(src)];
        let chain = 0;
        while (candidate >= 0 && src - candidate <= WINDOW && chain++ < 256) {
          const dist = src - candidate;
          if (dist >= 2) {
            let len = 0;
            while (len < maxLen && input[candidate + len] === input[src + len]) len++;
            if (len > bestLen) {
              bestLen = len;
              bestDist = dist;
              if (len === maxLen) break;
            }
          }
          candidate = prev[candidate];
        }
      }

      if (bestLen >= MIN_MATCH) {
        const d = bestDist - 1;
        out.push(((bestLen - MIN_MATCH) << 4) | (d >> 8), d & 0xff);
        out[flagIndex] |= 0x80 >> bit;
        src += bestLen;
      } else {
        out.push(input[src++]);
      }
    }
  }
  return Uint8Array.from(out);
}
