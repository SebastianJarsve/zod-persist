import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import { z } from 'zod'

import { persistentAtom, StorageAdapter } from '../index'
import { createFileAdapter } from '../adapters/json-file-adapter'

// --- MOCK NODE.JS MODULES ONLY ---
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
  },
}))

/**
 * A helper function to create a fresh, in-memory mock storage adapter for each test.
 */
const createMockStorage = (): StorageAdapter & {
  state: Record<string, string>
} => {
  const state: Record<string, string> = {}
  return {
    state,
    name: 'mock',
    getItem: vi.fn((key: string) => Promise.resolve(state[key])),
    setItem: vi.fn((key: string, value: string) => {
      state[key] = value
      return Promise.resolve()
    }),
  }
}

describe('persistentAtom', () => {
  let mockStorage: ReturnType<typeof createMockStorage>

  // This runs before each test, ensuring a clean state
  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.clearAllMocks()
  })

  describe('Core Functionality', () => {
    it('should initialize with the correct value', () => {
      const myAtom = persistentAtom(42, {
        key: 'test',
        storage: mockStorage,
      })
      expect(myAtom.get()).toBe(42)
    })

    it('should update its value when .set() is called', async () => {
      const myAtom = persistentAtom('hello', {
        key: 'test',
        storage: mockStorage,
      })
      await myAtom.ready
      myAtom.set('world')
      expect(myAtom.get()).toBe('world')
    })
  })

  describe('Persistence', () => {
    it('should call storage.setItem when a value is set', async () => {
      const myAtom = persistentAtom(1, {
        key: 'test-storage',
        storage: mockStorage,
      })
      await myAtom.ready
      myAtom.set(2)
      const expectedSerialized = JSON.stringify({ version: 1, data: 2 })
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'test-storage',
        expectedSerialized
      )
    })

    it('should hydrate from the storage adapter on initialization', async () => {
      mockStorage.state['existing-key'] = '"hydrated-value"'
      const myAtom = persistentAtom('initial', {
        key: 'existing-key',
        storage: mockStorage,
      })
      await myAtom.ready
      expect(mockStorage.getItem).toHaveBeenCalledWith('existing-key')
      expect(myAtom.get()).toBe('hydrated-value')
    })
  })

  describe('Debouncing', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('should only write once for multiple rapid set calls', async () => {
      const myAtom = persistentAtom(0, {
        key: 'debounced-test',
        storage: mockStorage,
        debounceMs: 100,
      })
      await myAtom.ready
      myAtom.set(1)
      myAtom.set(2)
      myAtom.set(3)
      expect(mockStorage.setItem).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(100)
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1)

      const expectedSerialized = JSON.stringify({ version: 1, data: 3 })
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'debounced-test',
        expectedSerialized
      )
    })
  })

  describe('Error Handling', () => {
    it('should create a backup of a corrupted file on hydration error', async () => {
      const corruptedData = 'this-is-not-valid-json'
      const corruptedFilePath = '/mock/support/path/corrupted.json'

      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(corruptedData))

      const myAtom = persistentAtom('initial', {
        key: 'corrupted-atom',
        storage: createFileAdapter(corruptedFilePath),
      })

      await expect(myAtom.ready).rejects.toThrow()

      expect(fs.rename).toHaveBeenCalledWith(
        corruptedFilePath,
        expect.stringContaining('.bak')
      )
    })

    it('should use the onCorruption handler to provide a fallback value', async () => {
      mockStorage.state['corrupt-key'] = 'not-json'

      const myAtom = persistentAtom(
        { status: 'default' },
        {
          key: 'corrupt-key',
          storage: mockStorage,
          onCorruption: (error) => {
            console.log('Corruption handled:', error.message)
            return { status: 'recovered' }
          },
        }
      )

      // The .ready promise should now RESOLVE successfully
      await myAtom.ready

      // The atom should have the fallback value
      expect(myAtom.get()).toEqual({ status: 'recovered' })

      // And it should write the recovered value back to storage
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'corrupt-key',
        expect.stringContaining('recovered')
      )
    })
  })

  describe('Zod Schema Validation', () => {
    const userSchema = z.object({
      name: z.string(),
      age: z.number().positive(),
    })

    it('should prevent setting a value that fails schema validation', async () => {
      const myAtom = persistentAtom(
        { name: 'John', age: 30 },
        {
          key: 'schema-test',
          storage: mockStorage,
          schema: userSchema,
        }
      )
      await myAtom.ready

      // Try to set an invalid value
      myAtom.set({ name: 'Invalid', age: -5 } as { name: string; age: number })

      // The atom's value should NOT have changed
      expect(myAtom.get()).toEqual({ name: 'John', age: 30 })
    })

    it('should throw an error during hydration if stored data is invalid', async () => {
      // Store data that is valid JSON but invalid according to the schema
      mockStorage.state['schema-test'] = JSON.stringify({
        version: 1,
        data: { name: 'Old', age: -99 },
      })

      const myAtom = persistentAtom(
        { name: 'Default', age: 1 },
        {
          key: 'schema-test',
          storage: mockStorage,
          schema: userSchema,
        }
      )

      // Expect the .ready promise to reject
      await expect(myAtom.ready).rejects.toThrow(/Schema validation failed/)
    })

    it('should successfully validate and set correct data', async () => {
      const myAtom = persistentAtom(
        { name: 'John', age: 30 },
        {
          key: 'schema-valid-test',
          storage: mockStorage,
          schema: userSchema,
        }
      )
      await myAtom.ready

      myAtom.set({ name: 'Jane', age: 25 })

      expect(myAtom.get()).toEqual({ name: 'Jane', age: 25 })
      expect(mockStorage.setItem).toHaveBeenCalled()
    })
  })

  describe('Migrations', () => {
    it('should run a migration function to update the data structure', async () => {
      // v1 data: just a string
      const v1Data = { version: 1, data: 'Old Name' }
      mockStorage.state['migration-test'] = JSON.stringify(v1Data)

      // v2 schema: an object
      const v2Schema = z.object({ name: z.string() })

      const myAtom = persistentAtom(
        { name: '' },
        {
          key: 'migration-test',
          storage: mockStorage,
          schema: v2Schema,
          version: 2,
          migrations: {
            2: (oldData: unknown) => {
              // Migration from string to object
              return { name: oldData as string }
            },
          },
        }
      )

      await myAtom.ready

      // The atom should be hydrated with the MIGRATED data
      expect(myAtom.get()).toEqual({ name: 'Old Name' })
    })

    it('should run multiple migrations sequentially', async () => {
      // v1 data
      const v1Data = {
        version: 1,
        data: { firstName: 'John', lastName: 'Doe' },
      }
      mockStorage.state['multi-migration-test'] = JSON.stringify(v1Data)

      const v3Schema = z.object({
        fullName: z.string(),
        initials: z.string(),
      })

      const myAtom = persistentAtom(
        { fullName: '', initials: '' },
        {
          key: 'multi-migration-test',
          storage: mockStorage,
          schema: v3Schema,
          version: 3,
          migrations: {
            // v1 -> v2
            2: (old: unknown) => {
              const oldData = old as
                | { firstName: string; lastName: string }
                | undefined
              return {
                fullName: `${oldData?.firstName} ${oldData?.lastName}`,
              }
            }, // v2 -> v3
            3: (old: unknown) => {
              const oldData = old as { fullName: string }
              return { ...oldData, initials: 'JD' } // Unsafe return is fixed by typing oldData
            },
          },
        }
      )

      await myAtom.ready

      expect(myAtom.get()).toEqual({ fullName: 'John Doe', initials: 'JD' })
    })

    it('should handle legacy data without version wrapper', async () => {
      // Old data without version wrapper (version 0)
      mockStorage.state['legacy-test'] = JSON.stringify('legacy-value')

      const v2Schema = z.object({ value: z.string() })

      const myAtom = persistentAtom(
        { value: '' },
        {
          key: 'legacy-test',
          storage: mockStorage,
          schema: v2Schema,
          version: 2,
          migrations: {
            1: (old: unknown) => ({ value: old as string }),
            2: (old: unknown) => old as { value: string }, // No change from v1 to v2
          },
        }
      )

      await myAtom.ready

      expect(myAtom.get()).toEqual({ value: 'legacy-value' })
    })
  })
})
