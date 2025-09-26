import { atom, type WritableAtom } from "nanostores";
import fs from "node:fs/promises";

export interface StorageAdapter {
  name: string;
  filePath?: string;
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
      if (opts.storage.filePath) {
        const backupPath = `${opts.storage.filePath}.${Date.now()}.bak`;
        try {
          await fs.rename(opts.storage.filePath, backupPath);
          console.log(`Created backup of corrupted file at: ${backupPath}`);
        } catch (backupError) {
          console.error(
            "Failed to create backup of corrupted file:",
            backupError,
          );
        }
      }

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
