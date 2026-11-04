/**
 * A growable little-endian byte buffer with a cursor.
 *
 * GBA cartridge pointers are stored as `0x08000000 + offset`; the `Ptr`
 * helpers translate between ROM offsets and that representation.
 */
export const GBA_ROM_BASE = 0x08000000;

export class ByteStream {
  private buf: Uint8Array;
  private len: number;
  /** Cursor used by the sequential read/write helpers. */
  position = 0;

  constructor(source?: Uint8Array | number) {
    if (source instanceof Uint8Array) {
      this.buf = source;
      this.len = source.length;
    } else {
      this.buf = new Uint8Array(Math.max(4, source ?? 64));
      this.len = 0;
    }
  }

  /** Number of meaningful bytes in the stream. */
  get length(): number {
    return this.len;
  }

  /** Allocated capacity. */
  get capacity(): number {
    return this.buf.length;
  }

  /** The bytes from 0 to `length` (a view, not a copy). */
  get bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }

  /** Direct access to the backing store. Use with care. */
  get raw(): Uint8Array {
    return this.buf;
  }

  seek(offset: number): this {
    this.position = offset;
    return this;
  }

  align(boundary = 4): this {
    const rem = this.position % boundary;
    if (rem !== 0) this.position += boundary - rem;
    return this;
  }

  /** Ensure `end` bytes are addressable, growing the buffer if needed. */
  ensure(end: number): void {
    if (end > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < end) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    if (end > this.len) this.len = end;
  }

  /** Resize capacity and length exactly, filling new bytes with `fill`. */
  resize(newLength: number, fill = 0): void {
    const next = new Uint8Array(newLength);
    next.set(this.buf.subarray(0, Math.min(this.len, newLength)));
    if (newLength > this.len) next.fill(fill, this.len);
    this.buf = next;
    this.len = newLength;
  }

  // ---------------------------------------------------------------- absolute

  u8(offset: number): number {
    return this.buf[offset];
  }
  u16(offset: number): number {
    return this.buf[offset] | (this.buf[offset + 1] << 8);
  }
  u32(offset: number): number {
    return (
      (this.buf[offset] |
        (this.buf[offset + 1] << 8) |
        (this.buf[offset + 2] << 16) |
        (this.buf[offset + 3] << 24)) >>>
      0
    );
  }
  /** Reads a GBA pointer and returns the ROM offset it points to. */
  ptr(offset: number): number {
    return this.u32(offset) - GBA_ROM_BASE;
  }
  ascii(offset: number, length: number): string {
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(this.buf[offset + i]);
    return s;
  }

  setU8(offset: number, value: number): void {
    this.ensure(offset + 1);
    this.buf[offset] = value & 0xff;
  }
  setU16(offset: number, value: number): void {
    this.ensure(offset + 2);
    this.buf[offset] = value & 0xff;
    this.buf[offset + 1] = (value >> 8) & 0xff;
  }
  setU32(offset: number, value: number): void {
    this.ensure(offset + 4);
    this.buf[offset] = value & 0xff;
    this.buf[offset + 1] = (value >>> 8) & 0xff;
    this.buf[offset + 2] = (value >>> 16) & 0xff;
    this.buf[offset + 3] = (value >>> 24) & 0xff;
  }
  setPtr(offset: number, romOffset: number): void {
    this.setU32(offset, romOffset + GBA_ROM_BASE);
  }
  setAscii(offset: number, text: string): void {
    this.ensure(offset + text.length);
    for (let i = 0; i < text.length; i++) this.buf[offset + i] = text.charCodeAt(i) & 0x7f;
  }

  // -------------------------------------------------------------- sequential
  // Sequential multi-byte reads/writes are naturally aligned, mirroring how
  // the game's structs are laid out in ROM.

  readU8(): number {
    return this.buf[this.position++];
  }
  readU16(): number {
    this.align(2);
    const v = this.u16(this.position);
    this.position += 2;
    return v;
  }
  readU32(): number {
    this.align(4);
    const v = this.u32(this.position);
    this.position += 4;
    return v;
  }
  readPtr(): number {
    return this.readU32() - GBA_ROM_BASE;
  }
  readBytes(length: number): Uint8Array {
    const out = this.buf.slice(this.position, this.position + length);
    this.position += length;
    return out;
  }

  writeU8(value: number): this {
    this.setU8(this.position++, value);
    return this;
  }
  writeU16(value: number): this {
    while (this.position % 2 !== 0) this.writeU8(0);
    this.setU16(this.position, value);
    this.position += 2;
    return this;
  }
  writeU32(value: number, aligned = true): this {
    if (aligned) while (this.position % 4 !== 0) this.writeU8(0);
    this.setU32(this.position, value);
    this.position += 4;
    return this;
  }
  writePtr(romOffset: number): this {
    return this.writeU32(romOffset + GBA_ROM_BASE);
  }
  writeAscii(text: string): this {
    this.setAscii(this.position, text);
    this.position += text.length;
    return this;
  }
  writeBytes(data: Uint8Array): this {
    this.ensure(this.position + data.length);
    this.buf.set(data, this.position);
    this.position += data.length;
    return this;
  }
  /** Copies `count` bytes from `distance` bytes back (may overlap — LZ77 style). */
  copyBack(count: number, distance: number): void {
    this.ensure(this.position + count);
    for (let i = 0; i < count; i++) {
      this.buf[this.position] = this.buf[this.position - distance];
      this.position++;
    }
  }

  /** Returns a copy of `length` bytes at `offset`. */
  slice(offset: number, length: number): Uint8Array {
    return this.buf.slice(offset, offset + length);
  }

  /** Overwrites bytes at `offset` with `data`. */
  set(offset: number, data: Uint8Array): void {
    this.ensure(offset + data.length);
    this.buf.set(data, offset);
  }
}
