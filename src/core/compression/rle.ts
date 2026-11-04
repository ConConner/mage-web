/**
 * Metroid Advance block-map RLE.
 *
 * 16-bit block values are split into two byte planes (low bytes at even
 * indices, high bytes at odd indices) that are compressed independently.
 * Each plane starts with a byte (1 or 2) giving the width of the length
 * fields; lengths are big-endian. A length with the top bit set encodes a
 * run of one repeated byte, otherwise a sequence of literal bytes follows.
 * A zero length terminates the plane.
 */

export interface RleDecompressResult {
  data: Uint8Array;
  compressedLength: number;
}

export function decompressRle(src: Uint8Array, offset: number, outputLength: number): RleDecompressResult {
  const out = new Uint8Array(outputLength);
  let pos = offset;

  for (let plane = 0; plane < 2; plane++) {
    let dst = plane;
    const width = src[pos++];
    if (width !== 1 && width !== 2) throw new Error(`Invalid RLE field width ${width}`);
    const runFlag = width === 1 ? 0x80 : 0x8000;

    for (;;) {
      if (pos >= src.length) throw new Error('RLE stream ended unexpectedly');
      let amount = width === 1 ? src[pos++] : (src[pos++] << 8) | src[pos++];
      if (amount === 0) break;
      if (amount & runFlag) {
        amount &= runFlag - 1;
        const value = src[pos++];
        for (; amount > 0; amount--, dst += 2) if (dst < outputLength) out[dst] = value;
      } else {
        for (; amount > 0; amount--, dst += 2) {
          const value = src[pos++];
          if (dst < outputLength) out[dst] = value;
        }
      }
    }
  }
  return { data: out, compressedLength: pos - offset };
}

/** Encodes one byte plane using length fields of `width` bytes. */
function encodePlane(values: Uint8Array, width: 1 | 2): number[] {
  const out: number[] = [width];
  const runFlag = width === 1 ? 0x80 : 0x8000;
  const maxCount = runFlag - 1;
  const minRun = width === 1 ? 3 : 4;
  const pushLength = (n: number) => {
    if (width === 2) out.push((n >> 8) & 0xff);
    out.push(n & 0xff);
  };

  let literals: number[] = [];
  const flushLiterals = () => {
    for (let i = 0; i < literals.length; i += maxCount) {
      const chunk = literals.slice(i, i + maxCount);
      pushLength(chunk.length);
      out.push(...chunk);
    }
    literals = [];
  };

  let i = 0;
  while (i < values.length) {
    const value = values[i];
    let run = 1;
    while (i + run < values.length && values[i + run] === value) run++;
    if (run >= minRun) {
      flushLiterals();
      for (let left = run; left > 0; left -= maxCount) {
        pushLength(runFlag | Math.min(left, maxCount));
        out.push(value);
      }
    } else {
      for (let k = 0; k < run; k++) literals.push(value);
    }
    i += run;
  }
  flushLiterals();
  pushLength(0);
  return out;
}

export function compressRle(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let plane = 0; plane < 2; plane++) {
    const values = new Uint8Array(Math.ceil((input.length - plane) / 2));
    for (let i = plane, j = 0; i < input.length; i += 2, j++) values[j] = input[i];
    const narrow = encodePlane(values, 1);
    const wide = encodePlane(values, 2);
    out.push(...(narrow.length <= wide.length ? narrow : wide));
  }
  return Uint8Array.from(out);
}
