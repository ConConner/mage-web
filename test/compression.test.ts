import { describe, expect, it } from 'vitest';
import { compressLz77, decompressLz77 } from '../src/core/compression/lz77';
import { compressRle, decompressRle } from '../src/core/compression/rle';

function sample(n: number, seed = 1): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    // Mix of runs and noise, like real block maps.
    out[i] = i % 64 < 40 ? (i >> 6) & 0xff : s & 0xff;
  }
  return out;
}

describe('LZ77', () => {
  it.each([0, 1, 2, 17, 4096, 50000])('round-trips %i bytes', (n) => {
    const data = sample(n);
    const packed = compressLz77(data);
    expect(decompressLz77(packed, 0).data).toEqual(data);
    expect(decompressLz77(packed, 0).compressedLength).toBe(packed.length);
  });
  it('compresses repetitive data', () => {
    expect(compressLz77(new Uint8Array(10000)).length).toBeLessThan(1400);
  });
});

describe('RLE', () => {
  it.each([2, 64, 0x3000, 0x2000 + 2])('round-trips %i bytes', (n) => {
    const data = sample(n, 7);
    const packed = compressRle(data);
    const out = decompressRle(packed, 0, n);
    expect(out.data).toEqual(data);
    expect(out.compressedLength).toBe(packed.length);
  });
  it('handles long runs beyond one length field', () => {
    const data = new Uint8Array(0x30000).fill(3);
    expect(decompressRle(compressRle(data), 0, data.length).data).toEqual(data);
  });
});
