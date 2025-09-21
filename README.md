# Persistent Atom for Nanostores

A utility for creating persistent [Nanostores](https://github.com/nanostores/nanostores) atoms within the **Raycast** extension environment. It supports both file and `LocalStorage` backends, debouncing, and is fully type-safe.

## Key Features

- **Simple Persistence:** Easily persist your Nanostores atoms to either Raycast's secure `LocalStorage` or the file system.
- **Type-Safe:** Written in TypeScript with strong generic types.
- **Asynchronous Hydration:** A `.ready` promise lets you know when the initial state has been loaded.
- **Debounced Writes:** Optionally debounce writes to storage to improve performance with rapidly changing state.
- **Full Control:** Utility methods like `.setAndFlush()`, `.exportToFile()`, and `.importFromFile()` provide precise control.

## Installation

```bash
pnpm add github:SebastianJarsve/nanostores-persistent
```

## Usage

Import `persistentAtom` and the storage adapters you need directly from the package.

```typescript
import { persistentAtom, createFileAdapter, createLocalStorageAdapter } from '@sebastianjarsve/persistent-atom';
import { z } from 'zod';
import { environment } from '@raycast/api';
import path from 'path';

// --- File-based store ---
const collectionsSchema = z.array(z.object({ id: z.string(), name: z.string() }));
type Collection = z.infer<typeof collectionsSchema>;

const collectionsPath = path.join(environment.supportPath, "collections.json");

const $collections = persistentAtom<Collection[]>([], {
  key: 'collections',
  storage: createFileAdapter(collectionsPath),
  serialize: (data) => JSON.stringify(collectionsSchema.parse(data)),
  deserialize: (raw) => collectionsSchema.parse(JSON.parse(raw)),
});

// --- LocalStorage-based store ---
const $activeTheme = persistentAtom<string>('light', {
  key: 'ui-theme',
  storage: createLocalStorageAdapter(),
  serialize: (val) => val,
  deserialize: (val) => val,
});
```

## API Reference

### `persistentAtom(initialValue, options)`

| Option            | Type               | Required | Description                                                        |
| :---------------- | :----------------- | :------- | :----------------------------------------------------------------- |
| **`key`**         | `string`           | Yes      | A unique key to identify the data in the storage adapter.          |
| **`storage`**     | `StorageAdapter`   | Yes      | The storage mechanism to use (e.g., `createFileAdapter(...)`).     |
| **`serialize`**   | `(v: T) => string` | Yes      | A function to serialize the state to a string.                     |
| **`deserialize`** | `(s: string) => T` | Yes      | A function to deserialize a string back to state.                  |
| **`debounceMs`**  | `number`           | No       | Milliseconds to debounce writes. If omitted, writes are immediate. |

### Storage Adapters

- **`createFileAdapter(filePath: string)`:** Creates a storage adapter that reads and writes to the provided absolute file path.
- **`createLocalStorageAdapter()`:** Creates a storage adapter that reads and writes to Raycast's secure `LocalStorage`.

## Testing

This package can be tested using `vitest`. Because it directly depends on `@raycast/api`, you must create a global mock for the Raycast APIs using a `setupFiles` in your `vitest.config.ts`.

**`src/test/setup.ts`**

```typescript
import { vi } from 'vitest';

vi.mock('@raycast/api', () => ({
  // ... your mock implementation
}));
```

## License

This project is licensed under the Beerware License. See the `LICENSE` file for the full text.
