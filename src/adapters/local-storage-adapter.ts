import type { StorageAdapter } from '../persistent-atom'

export interface LocalStorageInterface {
  getItem(key: string): Promise<string | undefined>
  setItem(key: string, value: string): Promise<void>
}

export function createLocalStorageAdapter(
  storage: LocalStorageInterface,
  adapterName: string = 'LocalStorage'
): StorageAdapter {
  if (storage == null) {
    throw new Error('Error: storage is null/undefined')
  }
  return {
    name: adapterName,
    getItem(key: string) {
      return storage.getItem(key)
    },
    setItem(key: string, value: string) {
      return storage.setItem(key, value)
    },
  }
}
