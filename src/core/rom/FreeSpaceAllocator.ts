import type { ByteStream } from '../io/ByteStream';

/**
 * Manages free space inside a ROM image.
 *
 * Unused regions are filled with 0xFF. When data in the middle of the ROM
 * shrinks or moves, the freed region is tagged with a `"mage"` marker
 * followed by a u16 length so it can be reused later. The marker format is
 * compatible with ROMs edited by the original MAGE.
 */
export interface AllocatorOptions {
  /** Lowest offset searched for tagged free regions. */
  searchStart: number;
  /**
   * Optional offset of a fixed data block near the end of the ROM (ZM keeps
   * the unknown-items/Metroid data there). Data may not be appended across it.
   */
  reservedOffset?: number;
  maxSize: number;
}

const MARKER = [0x6d, 0x61, 0x67, 0x65]; // "mage"
const MARKER_HEADER = 6;

export interface Allocation {
  offset: number;
  /** True if the space came from the end of data instead of a tagged region. */
  atEnd: boolean;
}

export class FreeSpaceAllocator {
  constructor(
    private readonly rom: ByteStream,
    private readonly options: AllocatorOptions,
  ) {}

  /** The first offset after the last non-0xFF byte (4-byte aligned). */
  endOfData(): number {
    const data = this.rom.raw;
    const runEnd = (from: number) => {
      let i = from;
      while (i > 0 && data[i - 1] === 0xff) i--;
      return i;
    };

    let end: number;
    const reserved = this.options.reservedOffset;
    if (reserved !== undefined && reserved < this.rom.length) {
      end = runEnd(reserved);
      if (reserved - end < 8) end = runEnd(this.rom.length);
    } else {
      end = runEnd(this.rom.length);
    }
    return (end + 3) & ~3;
  }

  private isMarkerAt(offset: number): boolean {
    const d = this.rom.raw;
    return d[offset] === MARKER[0] && d[offset + 1] === MARKER[1] && d[offset + 2] === MARKER[2] && d[offset + 3] === MARKER[3];
  }

  /**
   * Returns the end of a tagged free region directly following `offset`, or
   * `offset` itself if there is none. The marker is erased.
   */
  private absorbFollowingFreeRegion(offset: number): number {
    const d = this.rom.raw;
    let aligned = offset;
    while (aligned % 4 !== 0) {
      if (d[aligned++] !== 0) return offset;
    }
    if (!this.isMarkerAt(aligned)) return offset;
    const length = this.rom.u16(aligned + 4);
    d.fill(0xff, offset, aligned + MARKER_HEADER);
    return aligned + length;
  }

  /**
   * Marks the tail of a block as free after it was rewritten from
   * `previousLength` to `newLength` bytes (use 0 to free the whole block).
   */
  release(address: number, previousLength: number, newLength: number): void {
    const d = this.rom.raw;
    const endOfData = this.endOfData();
    let dataEnd = address + previousLength;
    let atEnd = dataEnd + 4 >= endOfData;
    if (atEnd) {
      for (; dataEnd < endOfData; dataEnd++) {
        if (d[dataEnd] !== 0) {
          atEnd = false;
          break;
        }
      }
    }

    let erase = address + newLength;
    if (atEnd) {
      // The block was the last thing in the ROM: truncate the data.
      if (erase > 0 && d[erase - 1] === 0xff) d[erase++] = 0;
      while (erase % 4 !== 0) d[erase++] = 0;
      d.fill(0xff, erase, Math.max(erase, endOfData));
      return;
    }

    const end = this.absorbFollowingFreeRegion(address + previousLength);
    if (erase < end) {
      if (erase > 0 && d[erase - 1] === 0xff) d[erase++] = 0;
      while (erase % 4 !== 0 && erase < end) d[erase++] = 0;
    }
    const freeStart = erase;
    if (freeStart < end) d.fill(0xff, freeStart, end);
    const freeLength = end - freeStart;
    if (freeLength < MARKER_HEADER || freeStart % 4 !== 0) return;
    this.rom.setAscii(freeStart, 'mage');
    this.rom.setU16(freeStart + 4, freeLength);
  }

  /** Finds space for `length` bytes, growing the ROM if necessary. */
  allocate(length: number): Allocation {
    const d = this.rom.raw;
    let endOfData = this.endOfData();

    for (let i = this.options.searchStart; i < endOfData; i += 4) {
      if (!this.isMarkerAt(i)) continue;
      const space = this.rom.u16(i + 4);
      if (space < length) continue;
      let valid = true;
      for (let j = MARKER_HEADER; j < space; j++) {
        if (d[i + j] !== 0xff) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      // Split the region; re-tag the remainder if it is still usable.
      d.fill(0xff, i, i + MARKER_HEADER);
      let remainderStart = i + length;
      while (remainderStart % 4 !== 0) d[remainderStart++] = 0;
      const remaining = i + space - remainderStart;
      if (remaining >= MARKER_HEADER) {
        this.rom.setAscii(remainderStart, 'mage');
        this.rom.setU16(remainderStart + 4, remaining);
      }
      return { offset: i, atEnd: false };
    }

    const reserved = this.options.reservedOffset;
    if (reserved !== undefined && endOfData < reserved && endOfData + length > reserved) {
      // Would overlap the reserved block: append after it instead.
      let i = this.rom.length;
      while (i > 0 && d[i - 1] === 0xff) i--;
      endOfData = (i + 3) & ~3;
    }

    while (endOfData + length + 4 > this.rom.length) {
      const next = Math.min(this.rom.length * 2, this.options.maxSize);
      if (next <= this.rom.length) throw new Error('ROM is full (32 MB limit reached).');
      this.rom.resize(next, 0xff);
    }
    return { offset: endOfData, atEnd: true };
  }

  /** Pads freshly appended data so the ROM end stays aligned and terminated. */
  finishAppend(offset: number, length: number): void {
    const d = this.rom.raw;
    let end = offset + length;
    if (length > 0 && d[end - 1] === 0xff) d[end++] = 0;
    while (end % 4 !== 0) d[end++] = 0;
  }
}
