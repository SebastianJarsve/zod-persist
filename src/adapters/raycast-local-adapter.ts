import { StorageAdapter } from "@/persistent-atom";
import { LocalStorage } from "@raycast/api";

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    name: "@raycast/api->LocalStorage",
    async getItem(key: string) {
      const rawValue = await LocalStorage.getItem(key);
      return rawValue == null ? null : String(rawValue);
    },
    setItem(key: string, value: string) {
      return LocalStorage.setItem(key, value);
    },
  };
}
