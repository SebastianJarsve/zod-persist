import { atom } from 'nanostores'
import type { WritableAtom } from 'nanostores'

export interface StorageAdapter {
  name: string
  filePath?: string
  getItem(this: void, key: string): Promise<string | null | undefined>
  setItem(this: void, key: string, value: string): Promise<void>
  createBackup?: (filePath: string) => Promise<void>
}

export type Migration = (oldData: unknown) => unknown

export type Options<T> = {
  key: string
  storage: StorageAdapter
  debounceMs?: number
  isEqual?: (a: T, b: T) => boolean
  schema?: {
    safeParse: (data: unknown) =>
      | { success: true; data: T }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | { success: false; error: any } // Zod's error type is too complex to specify
  }
  version?: number
  migrations?: Record<number, Migration>
  onCorruption?: (error: Error) => Promise<T>
}

export type PersistentAtom<T> = WritableAtom<T> & {
  ready: Promise<void>
  flush: () => Promise<void>
  setAndFlush: (next: T) => Promise<void>
}

type VersionedData<T> = {
  version: number
  data: T
}

export function persistentAtom<T>(
  initial: T,
  opts: Options<T>
): PersistentAtom<T> {
  if (!opts?.key) {
    throw new Error('[persistentAtom] Missing "key" option.')
  }
  if (!opts?.storage) {
    throw new Error('[persistentAtom] Missing "storage" option.')
  }

  const {
    key,
    storage,
    debounceMs,
    isEqual,
    schema,
    version = 1,
    migrations = {},
    onCorruption,
  } = opts

  const a = atom<T>(initial) as PersistentAtom<T>
  let debouncer: NodeJS.Timeout | undefined
  let isFlushing = false
  let isHydrationComplete = false

  // Save the original set method before we override it
  const baseSet = a.set.bind(a)

  // Enhanced serialization with versioning
  const serializeWithVersion = (value: T): string => {
    const versionedData: VersionedData<T> = {
      version,
      data: value,
    }
    return JSON.stringify(versionedData)
  }

  // Enhanced deserialization with schema validation and migrations
  const deserializeWithValidation = (raw: string): T => {
    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Failed to parse stored data: ${String(error)}`)
    }

    // Check if data is versioned
    const isVersioned =
      parsed &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      'data' in parsed

    let data: unknown
    let dataVersion: number

    if (isVersioned) {
      const versionedData = parsed as VersionedData<unknown>
      dataVersion = versionedData.version
      data = versionedData.data
    } else {
      // Legacy data without version
      dataVersion = 0
      data = parsed
    }

    // Run migrations if needed
    if (dataVersion < version) {
      console.log(
        `[persistentAtom] Migrating data for key "${key}" from version ${dataVersion} to ${version}`
      )

      for (let v = dataVersion + 1; v <= version; v++) {
        const migration = migrations[v]
        if (migration) {
          try {
            data = migration(data)
            console.log(
              `[persistentAtom] Successfully migrated to version ${v}`
            )
          } catch (error) {
            let errorMessage = String(error)
            if (error instanceof Error) {
              errorMessage = error.message
            }
            throw new Error(`Migration to version ${v} failed: ${errorMessage}`)
          }
        }
      }
    }

    // Validate with Zod schema if provided
    if (schema) {
      const result = schema.safeParse(data)
      if (!result.success) {
        throw result.error
      }
      return result.data
    }

    return data as T
  }

  const write = async (value: T) => {
    try {
      await storage.setItem(key, serializeWithVersion(value))
    } catch (error) {
      console.error(
        `[persistentAtom] Failed to write to ${storage.name} for key "${key}":`,
        error
      )
      throw error
    }
  }

  const createBackup = async () => {
    if (storage.filePath) {
      if (storage.createBackup && storage.filePath) {
        try {
          await storage.createBackup(storage.filePath)
        } catch (backupError) {
          console.error(
            '[persistentAtom] Failed to create backup:',
            backupError
          )
        }
      } else if (storage.filePath) {
        // Optional warning if filePath is set but backup method is missing
        console.warn(
          '[persistentAtom] Adapter defines filePath but does not provide createBackup functionality.'
        )
      }
    }
  }

  a.set = (next: T) => {
    // Prevent writes before hydration
    if (!isHydrationComplete) {
      throw new Error(
        `[persistentAtom] Cannot call .set() before hydration complete. ` +
          `Await atom.ready first, or use .setAndFlush() which handles this.`
      )
    }
    // Validate with schema before setting
    if (schema) {
      const result = schema.safeParse(next)
      if (!result.success) {
        throw result.error
      }
      next = result.data
    }

    if (isEqual && isEqual(a.get(), next)) return
    baseSet(next)
  }

  a.ready = (async () => {
    try {
      const raw = await storage.getItem(key)
      if (raw != null) {
        const data = deserializeWithValidation(raw)
        baseSet(data)
      }
    } catch (error) {
      console.error(
        `[persistentAtom] Failed to hydrate atom for key "${key}" with storage ${storage.name}:`,
        error
      )

      await createBackup()

      // Use onCorruption handler if provided
      if (onCorruption) {
        try {
          const fallbackData = await onCorruption(error as Error)
          console.log(
            `[persistentAtom] Using fallback data from onCorruption handler`
          )
          baseSet(fallbackData)
          // Write the fallback data to storage
          await write(fallbackData)
          return // Successfully recovered
        } catch (handlerError) {
          console.error(
            '[persistentAtom] onCorruption handler failed:',
            handlerError
          )
        }
      }

      // If no handler or handler failed, re-throw
      throw error
    }
  })().then(() => {
    isHydrationComplete = true
    a.subscribe((value) => {
      if (isFlushing) return
      if (debounceMs == null) {
        write(value).catch((error) => {
          console.error(
            `[persistentAtom] Failed to write to ${storage.name} for key "${key}":`,
            error
          )
        })
      } else {
        if (debouncer) clearTimeout(debouncer)
        debouncer = setTimeout(() => {
          write(value).catch((error) => {
            console.error(
              `[persistentAtom] Failed to write to ${storage.name} for key "${key}":`,
              error
            )
          })
        }, debounceMs)
      }
    })
  })

  a.flush = async () => {
    if (debouncer) {
      clearTimeout(debouncer)
      debouncer = undefined
    }
    await write(a.get())
  }

  a.setAndFlush = async (next: T) => {
    isFlushing = true
    try {
      a.set(next)
      await a.flush()
    } finally {
      isFlushing = false
    }
  }

  return a
}
