import { ByteStream } from '../io/ByteStream';
import { FreeSpaceAllocator } from './FreeSpaceAllocator';
import { GameInfo, detectGame, loadGameInfo } from '../game/GameInfo';
import { RomMap, romMapFor } from '../game/RomMap';

const MB = 0x100000;
const MAX_ROM_SIZE = 32 * MB;
const ROM_SIZES = [8 * MB, 16 * MB, 32 * MB];

export class RomError extends Error {}

/**
 * A loaded ROM image plus game metadata, the ROM map and free space
 * management. In a project the base ROM is only read; the builder works on
 * a fresh copy.
 */
export class Rom {
  readonly data: ByteStream;
  readonly game: GameInfo;
  readonly allocator: FreeSpaceAllocator;
  readonly map: RomMap;

  private constructor(data: Uint8Array, game: GameInfo) {
    this.data = new ByteStream(data);
    this.game = game;
    this.map = romMapFor(game.kind);
    this.allocator = new FreeSpaceAllocator(this.data, {
      searchStart: 0xa0000,
      reservedOffset: game.isMF ? undefined : game.metroidOffset,
      maxSize: MAX_ROM_SIZE,
    });
  }

  /** Validates the file and pads it to a power-of-two size with 0xFF. */
  static load(file: Uint8Array): Rom {
    if (file.length > MAX_ROM_SIZE) throw new RomError('ROM is larger than 32 MB.');
    if (file.length < 0xc0) throw new RomError('File is too small to be a GBA ROM.');
    const gameCode = String.fromCharCode(...file.subarray(0xac, 0xb0));
    const kind = detectGame(gameCode);
    if (!kind) {
      throw new RomError(
        `Unsupported game code "${gameCode}". Only Metroid Fusion (AMTE) and Metroid Zero Mission (BMXE), North American versions, are supported.`,
      );
    }

    const size = ROM_SIZES.find((s) => file.length <= s) ?? MAX_ROM_SIZE;
    const padded = new Uint8Array(size).fill(0xff);
    padded.set(file);
    const rom = new Rom(padded, loadGameInfo(gameCode));
    return rom;
  }

  get gameCode(): string {
    return this.game.gameCode;
  }

  /** Copy of the current ROM bytes for saving or backups. */
  snapshot(): Uint8Array {
    return this.data.bytes.slice();
  }

  restore(bytes: Uint8Array): void {
    this.data.resize(bytes.length);
    this.data.set(0, bytes);
  }

  /**
   * Finds every aligned word in the ROM that is a pointer to `offset`.
   * Heuristic: a matching 4-byte value that isn't really a pointer would be
   * rewritten too, exactly as the original editor behaves.
   */
  findPointers(offset: number): number[] {
    const d = this.data.raw;
    const target = offset + 0x08000000;
    const b0 = target & 0xff;
    const b1 = (target >>> 8) & 0xff;
    const b2 = (target >>> 16) & 0xff;
    const b3 = (target >>> 24) & 0xff;
    const found: number[] = [];
    const len = this.data.length - 3;
    for (let i = 0; i < len; i += 4) {
      if (d[i] === b0 && d[i + 1] === b1 && d[i + 2] === b2 && d[i + 3] === b3) found.push(i);
    }
    return found;
  }
}
