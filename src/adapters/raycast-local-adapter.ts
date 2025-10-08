import type { StorageAdapter } from '../persistent-atom'

export type LocalStorageInterface = Pick<StorageAdapter, 'getItem' | 'setItem'>

export function createLocalStorageAdapter(
  storage: LocalStorageInterface
): StorageAdapter {
  return {
    name: 'LocalStorage',
    async getItem(key: string) {
      return await storage.getItem(key)
    },
    async setItem(key: string, value: string) {
      await storage.setItem(key, value)
    },
  }
}
