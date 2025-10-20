export { persistentAtom } from './persistent-atom'

// Types
export type {
  StorageAdapter,
  PersistentAtom,
  Options,
  Migration,
} from './persistent-atom'

// Adapters
export { createFileAdapter, createLocalStorageAdapter } from './adapters'

export type { LocalStorageInterface } from './adapters'
