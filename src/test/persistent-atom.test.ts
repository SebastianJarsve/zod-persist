import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { StorageAdapter, persistentAtom } from "../persistent-atom";
import { afterEach } from "node:test";

/**
 * A helper function to create a fresh, in-memory mock storage adapter for each test.
 */
const createMockStorage = (): StorageAdapter & {
  state: Record<string, string>;
  clear: () => void;
} => {
  let state: Record<string, string> = {};

  return {
    state,
    getItem: vi.fn(async (key: string) => state[key]),
    setItem: vi.fn(async (key: string, value: string) => {
      state[key] = value;
    }),
    name: "mock",
    clear: () => {
      state = {};
    },
  };
};

describe("persistentAtom", () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  // This runs before each test, ensuring a clean state
  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  it("should call storage.setItem when a value is set", async () => {
    const myAtom = persistentAtom("initial", {
      key: "test-key",
      storageAdapter: mockStorage,
      serialize: (v) => v,
      deserialize: (s) => s,
    });

    // Wait for initial hydration to finish before proceeding
    await myAtom.ready;

    myAtom.set("new-value");

    // Check that our mock was called correctly
    expect(mockStorage.setItem).toHaveBeenCalledWith("test-key", "new-value");
  });

  it("should hydrate from the storage adapter on initialization", async () => {
    // Pre-populate our mock storage with some data
    mockStorage.state["existing-key"] = '"hydrated-value"';

    const myAtom = persistentAtom("initial", {
      key: "existing-key",
      storageAdapter: mockStorage,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    });

    // The .ready promise triggers the getItem call
    await myAtom.ready;

    // Check that it tried to read from storage and updated its value
    expect(mockStorage.getItem).toHaveBeenCalledWith("existing-key");
    expect(myAtom.get()).toBe("hydrated-value");
  });

  it("should call storage.setItem when a value is set", async () => {
    const myAtom = persistentAtom(1, {
      key: "test-storage",
      storageAdapter: mockStorage,
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
      storageAdapter: mockStorage,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    });
    await myAtom.ready;
    expect(mockStorage.getItem).toHaveBeenCalledWith("existing-key");
    expect(myAtom.get()).toBe("hydrated-value");
  });

  // --- Debounce Tests ---
  describe("debouncing", () => {
    beforeEach(() => {
      // Use fake timers for this block of tests
      vi.useFakeTimers();
    });
    afterEach(() => {
      // Restore real timers after the tests
      vi.useRealTimers();
    });

    it("should only write once for multiple rapid set calls", async () => {
      const myAtom = persistentAtom(0, {
        key: "debounced-test",
        storageAdapter: mockStorage,
        serialize: String,
        deserialize: Number,
        debounceMs: 100, // Debounce by 100ms
      });
      await myAtom.ready;

      myAtom.set(1);
      myAtom.set(2);
      myAtom.set(3);

      // At this point, no write should have happened yet
      expect(mockStorage.setItem).not.toHaveBeenCalled();

      // Fast-forward time by 100ms
      await vi.advanceTimersByTimeAsync(100);

      // Now, the write should have happened exactly once with the latest value
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockStorage.setItem).toHaveBeenCalledWith("debounced-test", "3");
    });

    it("should write immediately with .setAndFlush()", async () => {
      const myAtom = persistentAtom(0, {
        key: "debounced-test",
        storageAdapter: mockStorage,
        serialize: String,
        deserialize: Number,
        debounceMs: 100,
      });
      await myAtom.ready;

      // This should bypass the debounce timer
      await myAtom.setAndFlush(5);

      // The write should have happened immediately
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockStorage.setItem).toHaveBeenCalledWith("debounced-test", "5");
    });
  });
});
