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
    async getItem(key: string) {
      const value = await storage.getItem(key)
      // Normalize null to undefined for consistency
      return value ?? undefined
    },
    async setItem(key: string, value: string) {
      await storage.setItem(key, value)
    },
  }
}
