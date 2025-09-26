import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";

import { persistentAtom, StorageAdapter } from "../index";
import { createFileAdapter } from "../adapters/json-file-adapter";

// --- MOCK NODE.JS MODULES ONLY ---
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
  },
}));

/**
 * A helper function to create a fresh, in-memory mock storage adapter for each test.
 */
const createMockStorage = (): StorageAdapter & {
  state: Record<string, string>;
} => {
  let state: Record<string, string> = {};
  return {
    state,
    name: "mock",
    getItem: vi.fn(async (key: string) => state[key]),
    setItem: vi.fn(async (key: string, value: string) => {
      state[key] = value;
    }),
  };
};

describe("persistentAtom", () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  // This runs before each test, ensuring a clean state
  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.clearAllMocks();
  });

  describe("Core Functionality", () => {
    it("should initialize with the correct value", () => {
      const myAtom = persistentAtom(42, {
        key: "test",
        storage: mockStorage,
        serialize: String,
        deserialize: Number,
      });
      expect(myAtom.get()).toBe(42);
    });

    it("should update its value when .set() is called", async () => {
      const myAtom = persistentAtom("hello", {
        key: "test",
        storage: mockStorage,
        serialize: (v) => v,
        deserialize: (s) => s,
      });
      await myAtom.ready;
      myAtom.set("world");
      expect(myAtom.get()).toBe("world");
    });
  });

  describe("Persistence", () => {
    it("should call storage.setItem when a value is set", async () => {
      const myAtom = persistentAtom(1, {
        key: "test-storage",
        storage: mockStorage,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      });
      await myAtom.ready;
      myAtom.set(2);
      expect(mockStorage.setItem).toHaveBeenCalledWith("test-storage", "2");
    });

    it("should hydrate from the storage adapter on initialization", async () => {
      mockStorage.state["existing-key"] = '"hydrated-value"';
      const myAtom = persistentAtom("initial", {
        key: "existing-key",
        storage: mockStorage,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      });
      await myAtom.ready;
      expect(mockStorage.getItem).toHaveBeenCalledWith("existing-key");
      expect(myAtom.get()).toBe("hydrated-value");
    });
  });

  describe("Debouncing", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("should only write once for multiple rapid set calls", async () => {
      const myAtom = persistentAtom(0, {
        key: "debounced-test",
        storage: mockStorage,
        serialize: String,
        deserialize: Number,
        debounceMs: 100,
      });
      await myAtom.ready;
      myAtom.set(1);
      myAtom.set(2);
      myAtom.set(3);
      expect(mockStorage.setItem).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockStorage.setItem).toHaveBeenCalledWith("debounced-test", "3");
    });
  });

  describe("Error Handling", () => {
    it("should create a backup of a corrupted file on hydration error", async () => {
      const corruptedData = "this-is-not-valid-json";
      const corruptedFilePath = "/mock/support/path/corrupted.json";

      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(corruptedData));
      const failingDeserialize = (raw: string) => JSON.parse(raw);

      const myAtom = persistentAtom("initial", {
        key: "corrupted-atom",
        storage: createFileAdapter(corruptedFilePath),
        serialize: JSON.stringify,
        deserialize: failingDeserialize,
      });

      await expect(myAtom.ready).rejects.toThrow();

      expect(fs.rename).toHaveBeenCalledWith(
        corruptedFilePath,
        expect.stringContaining(".bak"),
      );
    });
  });
});
