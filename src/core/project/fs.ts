/**
 * File access for a project folder. The host (Electron, browser File System
 * Access API, tests) provides an implementation; paths are always relative,
 * '/'-separated and never contain '..'.
 */
export interface WorkspaceFs {
  /** Folder name, shown as the project root in the asset browser. */
  readonly name: string;
  /** Host-specific location (absolute folder path in Electron), if any. */
  readonly location?: string;
  /** Every file below the root (recursive), excluding `.git`. */
  list(): Promise<string[]>;
  read(path: string): Promise<Uint8Array | undefined>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Optional batched variants; hosts with expensive round trips implement these. */
  readMany?(paths: string[]): Promise<(Uint8Array | undefined)[]>;
  writeMany?(files: [string, Uint8Array][]): Promise<void>;
}

export function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) throw new Error(`Invalid project path: ${path}`);
  return parts.join('/');
}

export async function readFiles(fs: WorkspaceFs, paths: string[]): Promise<(Uint8Array | undefined)[]> {
  if (fs.readMany) {
    const out: (Uint8Array | undefined)[] = [];
    for (let i = 0; i < paths.length; i += 200) out.push(...(await fs.readMany(paths.slice(i, i + 200))));
    return out;
  }
  return Promise.all(paths.map((p) => fs.read(p)));
}

export async function writeFiles(fs: WorkspaceFs, files: [string, Uint8Array][], onProgress?: (done: number) => void): Promise<void> {
  for (let i = 0; i < files.length; i += 100) {
    const chunk = files.slice(i, i + 100);
    if (fs.writeMany) await fs.writeMany(chunk);
    else await Promise.all(chunk.map(([p, d]) => fs.write(p, d)));
    onProgress?.(Math.min(files.length, i + chunk.length));
  }
}

/** In-memory folder, used by tests and by browsers without folder access. */
export class MemoryFs implements WorkspaceFs {
  readonly files = new Map<string, Uint8Array>();

  constructor(readonly name = 'project') {}

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async read(path: string): Promise<Uint8Array | undefined> {
    return this.files.get(normalizePath(path));
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    this.files.set(normalizePath(path), data.slice());
  }

  async remove(path: string): Promise<void> {
    this.files.delete(normalizePath(path));
  }
}

export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();
