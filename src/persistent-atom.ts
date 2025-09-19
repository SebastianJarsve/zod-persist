import { atom, type WritableAtom } from "nanostores";
import fs from "node:fs/promises";
import path from "node:path";

export interface StorageAdapter {
  getItem(key: string): Promise<string | null | undefined>;
  setItem(key: string, value: string): Promise<void>;
  name: string;
}

// Define the configuration options for the persistent atom.
export type Options<T> = {
  /** The key for the storage adapter. */
  key: string;
  /** Which storage adapter to use. */
  storageAdapter: StorageAdapter;
  /** The directory to store the file in. Defaults to Raycast's support path. */
  dir?: string;
  /** Debounce writes in milliseconds. If undefined, writes are immediate. */
  debounceMs?: number;
  /** Custom serialization function. Defaults to `JSON.stringify`. */
  serialize?: (v: T) => string;
  /** Custom deserialization function. Defaults to `JSON.parse`. */
  deserialize?: (s: string) => T;
  /** Optional equality check to prevent writes if the value is the same. */
  isEqual?: (a: T, b: T) => boolean;
};

// Define the return type, extending the base Nanostores atom with our custom methods.
export type PersistentAtom<T> = WritableAtom<T> & {
  /** A promise that resolves when the atom is hydrated with the persisted state. */
  ready: Promise<void>;
  /** Flushes any debounced writes to the storage adapetr immediately. */
  flush: () => Promise<void>;
  /** Sets a new value and immediately flushes it to the storage adapter. */
  setAndFlush: (next: T) => Promise<void>;
  /** Exports the current state to a specified file. */
  exportToFile?: (fileName?: string) => Promise<void>;
  /** Imports state from a specified file and updates the atom. */
  importFromFile?: (fileName?: string) => Promise<void>;
};

/**
 * Creates a Nanostores atom that persists its state to LocalStorage and/or a file.
 *
 * @param initial The initial value of the atom if no persisted state is found.
 * @param opts Configuration options for persistence.
 * @returns A persistent atom with added utility methods.
 */
export function persistentAtom<T>(
  initial: T,
  opts: Options<T>,
): PersistentAtom<T> {
  // Destructure the options object to configure the atom, providing sensible defaults.
  const {
    storageAdapter,
    key,
    fileName,
    dir,
    debounceMs,
    serialize = JSON.stringify,
    deserialize = JSON.parse as (s: string) => T,
    isEqual,
  } = opts as Options<T> & { key?: string; fileName?: string };

  // Create a standard Nanostores atom and cast it to our extended type to attach custom properties.
  const a = atom<T>(initial) as PersistentAtom<T>;

  // A variable to hold the timer for debounced writes.
  let debouncer: NodeJS.Timeout | undefined;
  let isFlushing = false;

  // A single, reusable async function to write the state to the configured storage.
  const write = async (value: T) => {
    try {
      await storageAdapter?.setItem(key, serialize(value));
    } catch (error) {
      console.error(
        `[persistentAtom] Failed to write to ${storageAdapter.name} ${key}:`,
        error,
      );
    }
  };
  a.ready = (async () => {
    try {
      let hydrated = false; // When to use this?
      const raw = await storageAdapter.getItem(key);
      if (raw) a.set(deserialize(raw));
    } catch (error) {
      console.error(error);
      // TODO: log error to file
    }
  })().then(() => {
    a.subscribe((value) => {
      if (isFlushing) return;
      if (debounceMs == null) void write(value);
      else {
        if (debouncer) clearTimeout(debouncer);
        debouncer = setTimeout(() => void write(value), debounceMs);
      }
    });
  });
  // --- `set` Method Override ---
  // We "monkey-patch" the original .set() method to add our custom equality check.
  const baseSet = a.set.bind(a);
  a.set = (next: T) => {
    // If an `isEqual` function is provided and returns true, we abort the update.
    if (isEqual && isEqual(a.get(), next)) return;
    baseSet(next);
  };

  // --- Manual Control Methods ---

  // Manually trigger a write, bypassing any debouncing.
  a.flush = async () => {
    if (debouncer) {
      clearTimeout(debouncer);
      debouncer = undefined;
    }
    await write(a.get());
  };

  // A convenience method to set a new value and immediately flush it.
  a.setAndFlush = async (next: T) => {
    a.set(next);
    await a.flush();
  };

  // Export the current state to a specified (or default) file.
  if (dir)
    a.exportToFile = async (customFile?: string) => {
      const fp = path.join(dir, customFile ?? fileName ?? "state.json");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fp, serialize(a.get()));
    };

  // Import state from a file, overwriting the current state in the atom.
  if (dir)
    a.importFromFile = async (customFile?: string) => {
      const fp = path.join(dir, customFile ?? fileName ?? "state.json");
      const buf = await fs.readFile(fp);
      a.set(deserialize(buf.toString()));
    };

  // --- Exit Hook ---
  // A best-effort attempt to flush any pending changes when the Node.js process exits.
  // Note: Async operations are not guaranteed to complete during all exit events.
  for (const sig of ["beforeExit", "SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => a.flush());
  }

  // Return the fully constructed and enhanced atom.
  return a;
}
