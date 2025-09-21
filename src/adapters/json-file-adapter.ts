import { StorageAdapter } from "@/persistent-atom";
import fs from "node:fs/promises";
import path from "node:path";

export function createFileAdapter(filePath: string): StorageAdapter {
  return {
    name: `file:${path.basename(filePath)}`,
    async getItem() {
      const buf = await fs.readFile(filePath).catch(() => undefined);
      return buf ? buf.toString() : undefined;
    },
    async setItem(_, value) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, value);
    },
  };
}
