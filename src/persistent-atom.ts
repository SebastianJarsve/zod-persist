import { atom, type WritableAtom } from "nanostores";
import { environment } from "@raycast/api"; // Needed for the new utility functions
import fs from "node:fs/promises";
import path from "node:path";

export interface StorageAdapter {
  name: string;
  getItem(key: string): Promise<string | null | undefined>;
  setItem(key: string, value: string): Promise<void>;
}

export type Options<T> = {
  key: string;
  storage: StorageAdapter;
  serialize?: (v: T) => string;
  deserialize?: (s: string) => T;
  debounceMs?: number;
  isEqual?: (a: T, b: T) => boolean;
};

export type PersistentAtom<T> = WritableAtom<T> & {
  ready: Promise<void>;
  flush: () => Promise<void>;
  setAndFlush: (next: T) => Promise<void>;
};

export function persistentAtom<T>(
  initial: T,
  opts: Options<T>,
): PersistentAtom<T> {
  if (!opts?.key) {
    throw new Error('[persistentAtom] Missing "key" option.');
  }
  if (!opts?.storage) {
    throw new Error('[persistentAtom] Missing "storage" option.');
  }

  const {
    key,
    storage,
    debounceMs,
    serialize = JSON.stringify,
    deserialize = JSON.parse as (s: string) => T,
    isEqual,
  } = opts;

  const a = atom<T>(initial) as PersistentAtom<T>;
  let debouncer: NodeJS.Timeout | undefined;
  let isFlushing = false;

  const write = async (value: T) => {
    try {
      await storage.setItem(key, serialize(value));
    } catch (error) {
      console.error(
        `[persistentAtom] Failed to write to ${storage.name} for key "${key}":`,
        error,
      );
    }
  };

  a.ready = (async () => {
    try {
      const raw = await storage.getItem(key);
      if (raw != null) {
        a.set(deserialize(raw));
      }
    } catch (error) {
      console.error(
        `[persistentAtom] Failed to hydrate atom for key "${key}" with storage ${storage.name}:`,
        error,
      );
      throw error;
    }
  })().then(() => {
    a.subscribe((value) => {
      if (isFlushing) return;
      if (debounceMs == null) {
        void write(value);
      } else {
        if (debouncer) clearTimeout(debouncer);
        debouncer = setTimeout(() => void write(value), debounceMs);
      }
    });
  });

  const baseSet = a.set.bind(a);
  a.set = (next: T) => {
    if (isEqual && isEqual(a.get(), next)) return;
    baseSet(next);
  };

  a.flush = async () => {
    if (debouncer) {
      clearTimeout(debouncer);
      debouncer = undefined;
    }
    await write(a.get());
  };

  a.setAndFlush = async (next: T) => {
    isFlushing = true;
    try {
      a.set(next);
      await a.flush();
    } finally {
      isFlushing = false;
    }
  };

  return a;
}

// --- UTILITY FUNCTIONS ---

/**
 * Exports the current state of a persistent atom to a specified file.
 */
export async function exportAtomToFile<T>(
  atom: WritableAtom<T>,
  serialize: (v: T) => string,
  fileName: string,
) {
  const serializedValue = serialize(atom.get());
  const filePath = path.join(environment.supportPath, fileName);
  await fs.mkdir(environment.supportPath, { recursive: true });
  await fs.writeFile(filePath, serializedValue);
}

/**
 * Imports state from a file, overwriting the current state in the atom.
 */
export async function importAtomFromFile<T>(
  atom: PersistentAtom<T>,
  deserialize: (s: string) => T,
  fileName: string,
) {
  const filePath = path.join(environment.supportPath, fileName);
  const buf = await fs.readFile(filePath);
  const raw = buf.toString();
  await atom.setAndFlush(deserialize(raw));
}
