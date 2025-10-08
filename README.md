# zod-persist for Nanostores

Type-safe persistent state with Zod validation, migrations, and error recovery. Works with [Nanostores](https://github.com/nanostores/nanostores) and any storage backend (file system, LocalStorage, IndexedDB, etc.).

## Key Features

- **Simple Persistence:** Easily persist your Nanostores atoms to any storage backend (file system, LocalStorage, IndexedDB, etc.).
- **Type-Safe:** Written in TypeScript with strong generic types.
- **Built-in Zod Support:** Automatic schema validation on read and write operations.
- **Data Migrations:** Version your data and provide migration functions for seamless upgrades.
- **Error Recovery:** Automatic backup creation and customizable corruption handlers.
- **Asynchronous Hydration:** A `.ready` promise lets you know when the initial state has been loaded.
- **Debounced Writes:** Optionally debounce writes to storage to improve performance with rapidly changing state.
- **Full Control:** Utility methods like `.setAndFlush()` provide precise control.

## Installation

```bash
# Assuming the package is published as 'zod-persist'
npm install zod-persist
# OR
pnpm add zod-persist
# OR
yarn add zod-persist
```

## Basic Usage

Import `persistentAtom` and the necessary adapters from the package.

```typescript
import { persistentAtom } from 'zod-persist';
import { createFileAdapter, createLocalStorageAdapter }
import { z } from 'zod';
import type { LocalStorageInterface } from 'zod-persist/adapters';

// --- File-based store with Zod validation ---
const collectionSchema = z.object({ id: z.string(), name: z.string() });
const collectionsSchema = z.array(collectionSchema);
type Collection = z.infer<typeof collectionSchema>;

const $collections = persistentAtom<Collection[]>([], {
  key: 'collections',
  storage: createFileAdapter('./collections.json'),
  schema: collectionsSchema, // 🎉 Built-in validation!
});

// --- Browser LocalStorage Example ---

// 1. Create a storage object that matches the LocalStorageInterface
const browserStorage: LocalStorageInterface = {
  async getItem(key: string) {
    return localStorage.getItem(key) ?? undefined;
  },
  async setItem(key: string, value: string) {
    localStorage.setItem(key, value);
  },
};

// 2. Pass it to the adapter factory
const $activeTheme = persistentAtom<string>('light', {
  key: 'ui-theme',
  storage: createLocalStorageAdapter(browserStorage),
});
```

## Advanced Features

### 🎯 Built-in Zod Validation

Schema validation happens automatically on both read and write operations:

```typescript
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive(),
})

const $user = persistentAtom<z.infer<typeof userSchema>>(
  { id: '', name: '', email: '', age: 0 },
  {
    key: 'user',
    storage: createLocalStorageAdapter(),
    schema: userSchema, // Validates on load and before save
  }
)

// ✅ This will be validated
$user.set({
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'John',
  email: 'john@example.com',
  age: 30,
})

// ❌ This will fail validation and log an error
$user.set({ id: 'invalid', name: '', email: 'not-an-email', age: -5 })
```

### 🔄 Data Migrations

Version your data and provide migration functions for breaking changes:

```typescript
// Version 1: Simple array of strings
const v1Schema = z.array(z.string())

// Version 2: Array of objects with id and name
const v2Schema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
  })
)

// Version 3: Added timestamps
const v3Schema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.number(),
  })
)

const $items = persistentAtom<z.infer<typeof v3Schema>>([], {
  key: 'items',
  storage: createFileAdapter('items.json'),
  schema: v3Schema,
  version: 3,
  migrations: {
    // Migrate from v1 (string[]) to v2 (object[])
    2: (oldData) => {
      const strings = v1Schema.parse(oldData)
      return strings.map((name, index) => ({
        id: `item-${index}`,
        name,
      }))
    },
    // Migrate from v2 to v3 (add timestamps)
    3: (oldData) => {
      const items = v2Schema.parse(oldData)
      return items.map((item) => ({
        ...item,
        createdAt: Date.now(),
      }))
    },
  },
})
```

**Migration Flow:**

1. Data is loaded from storage
2. Version is checked (stored in the data automatically)
3. If version < current, migrations run sequentially
4. Final data is validated with the schema
5. Data is saved with the new version

### 🛡️ Corruption Recovery

Handle corrupted data gracefully with the `onCorruption` option:

```typescript
const $settings = persistentAtom<Settings>(defaultSettings, {
  key: 'settings',
  storage: createFileAdapter('settings.json'),
  schema: settingsSchema,
  onCorruption: (error) => {
    console.error('Settings corrupted, using defaults:', error)
    // Return fallback data
    return defaultSettings
  },
})
```

**What happens on corruption:**

1. Automatic backup is created (e.g., `settings.json.1234567890.bak`)
2. `onCorruption` handler is called with the error
3. Returned fallback data is validated and saved
4. App continues with fallback data

Without `onCorruption`, the error is re-thrown and you must handle it.

## API Reference

### `persistentAtom(initialValue, options)`

| Option             | Type                        | Required | Description                                                        |
| :----------------- | :-------------------------- | :------- | :----------------------------------------------------------------- |
| **`key`**          | `string`                    | Yes      | A unique key to identify the data in the storage adapter.          |
| **`storage`**      | `StorageAdapter`            | Yes      | The storage mechanism to use (e.g., `createFileAdapter(...)`).     |
| **`serialize`**    | `(v: T) => string`          | No       | Custom serialization function. Defaults to `JSON.stringify`.       |
| **`deserialize`**  | `(s: string) => T`          | No       | Custom deserialization function. Defaults to `JSON.parse`.         |
| **`debounceMs`**   | `number`                    | No       | Milliseconds to debounce writes. If omitted, writes are immediate. |
| **`isEqual`**      | `(a: T, b: T) => boolean`   | No       | Custom equality check to prevent unnecessary writes.               |
| **`schema`**       | `z.ZodSchema<T>`            | No       | Zod schema for automatic validation on read and write.             |
| **`version`**      | `number`                    | No       | Current data version. Defaults to `1`.                             |
| **`migrations`**   | `Record<number, Migration>` | No       | Migration functions keyed by target version.                       |
| **`onCorruption`** | `(error: Error) => T`       | No       | Handler for corrupted data. Returns fallback value.                |

### Storage Adapters

#### File Adapter

**`createFileAdapter(filePath: string)`:** Creates a storage adapter that reads and writes to the provided file path.

```typescript
import { createFileAdapter } from 'zod-persist'

const storage = createFileAdapter('./data.json')
```

#### LocalStorage Adapter

**`createLocalStorageAdapter(storage: LocalStorageInterface)`:** Creates a storage adapter for any LocalStorage-like interface.

```typescript
import { createLocalStorageAdapter } from 'zod-persist'

// Browser
const browserStorage = createLocalStorageAdapter({
  async getItem(key: string) {
    return localStorage.getItem(key) ?? undefined
  },
  async setItem(key: string, value: string) {
    localStorage.setItem(key, value)
  },
})

// Raycast
import { LocalStorage } from '@raycast/api'
const raycastStorage = createLocalStorageAdapter(LocalStorage)

// Custom implementation
const customStorage = createLocalStorageAdapter({
  async getItem(key: string) {
    // Your implementation
  },
  async setItem(key: string, value: string) {
    // Your implementation
  },
})
```

### PersistentAtom Methods

```typescript
const $atom = persistentAtom(initialValue, options)

// Wait for initial hydration
await $atom.ready

// Standard nanostore methods
$atom.get()
$atom.set(newValue)
$atom.subscribe((value) => console.log(value))

// Flush pending writes immediately
await $atom.flush()

// Set value and wait for write to complete
await $atom.setAndFlush(newValue)
```

## Recipes

### Combining All Features

```typescript
const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  tags: z.array(z.string()),
})

const tasksSchema = z.array(taskSchema)
type Task = z.infer<typeof taskSchema>

const $tasks = persistentAtom<Task[]>([], {
  key: 'tasks',
  storage: createFileAdapter(path.join(environment.supportPath, 'tasks.json')),
  schema: tasksSchema,
  version: 2,
  debounceMs: 1000,
  migrations: {
    2: (oldData) => {
      // Add tags field to existing tasks
      return (oldData as any[]).map((task) => ({
        ...task,
        tags: task.tags || [],
      }))
    },
  },
  onCorruption: (error) => {
    console.error('Tasks corrupted:', error)
    showToast({
      style: Toast.Style.Failure,
      title: 'Tasks data corrupted, resetting',
    })
    return []
  },
})

// Use in your extension
await $tasks.ready
$tasks.set([...tasks, newTask])
```

### React Hook with Hydration Status

The `useAtom` hook automatically handles hydration for persistent atoms and provides loading states:

```tsx
import { useAtom } from 'zod-persist/react'

function TaskList() {
  const { value: tasks, isHydrated } = useAtom($tasks)

  if (!isHydrated) {
    return <div>Loading tasks...</div>
  }

  return (
    <List>
      {tasks.map((task) => (
        <List.Item key={task.id} title={task.title} />
      ))}
    </List>
  )
}
```

## Framework Examples

### Raycast Extension

```typescript
import {
  persistentAtom,
  createFileAdapter,
  createLocalStorageAdapter,
} from 'zod-persist'
import { LocalStorage, environment } from '@raycast/api'
import path from 'path'
import { z } from 'zod'

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
})

// File storage
const $tasks = persistentAtom<z.infer<typeof taskSchema>[]>([], {
  key: 'tasks',
  storage: createFileAdapter(path.join(environment.supportPath, 'tasks.json')),
  schema: z.array(taskSchema),
})

// LocalStorage
const $settings = persistentAtom<Settings>(defaultSettings, {
  key: 'settings',
  storage: createLocalStorageAdapter(LocalStorage),
  schema: settingsSchema,
})
```

### Browser / React App

```typescript
import { persistentAtom, createLocalStorageAdapter } from 'zod-persist'
import { z } from 'zod'

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})

const browserStorage = {
  async getItem(key: string) {
    return localStorage.getItem(key) ?? undefined
  },
  async setItem(key: string, value: string) {
    localStorage.setItem(key, value)
  },
}

const $user = persistentAtom<z.infer<typeof userSchema> | null>(null, {
  key: 'user',
  storage: createLocalStorageAdapter(browserStorage),
  schema: z.nullable(userSchema),
})
```

### Node.js / Electron

```typescript
import { persistentAtom, createFileAdapter } from 'zod-persist'
import { z } from 'zod'
import path from 'path'
import os from 'os'

const configSchema = z.object({
  apiKey: z.string(),
  endpoint: z.string().url(),
})

const configPath = path.join(os.homedir(), '.myapp', 'config.json')

const $config = persistentAtom<z.infer<typeof configSchema>>(
  {
    apiKey: '',
    endpoint: 'https://api.example.com',
  },
  {
    key: 'config',
    storage: createFileAdapter(configPath),
    schema: configSchema,
  }
)
```

## Migration Guide

### From Manual Zod Validation

**Before:**

```typescript
const $data = persistentAtom<Data>(initial, {
  key: 'data',
  storage: createFileAdapter('data.json'),
  serialize: (data) => JSON.stringify(schema.parse(data)),
  deserialize: (raw) => schema.parse(JSON.parse(raw)),
})
```

**After:**

```typescript
const $data = persistentAtom<Data>(initial, {
  key: 'data',
  storage: createFileAdapter('data.json'),
  schema, // That's it! 🎉
})
```

### Adding Versioning to Existing Data

If you already have data in production without versioning:

```typescript
const $data = persistentAtom<NewDataType>(initial, {
  key: 'data',
  storage: createFileAdapter('data.json'),
  schema: newSchema,
  version: 2, // Start at 2
  migrations: {
    // Migration from unversioned (0) to v1 is automatic
    // Add migration from v1 to v2
    2: (oldData) => {
      // Transform old data to new format
      return transformData(oldData)
    },
  },
})
```

## Troubleshooting

### Data Not Persisting

1. Check that `await $atom.ready` completes successfully
2. Verify file permissions for file-based storage
3. Check console for serialization errors

### Schema Validation Failing

1. Check the error message in console
2. Verify your schema matches your data structure
3. Use `.safeParse()` to debug: `schema.safeParse(yourData)`

### Migrations Not Running

1. Ensure `version` is higher than stored version
2. Check that migration functions are keyed correctly
3. Verify migrations don't throw errors (check console)

## Performance Tips

- Use `debounceMs` for frequently updated state (e.g., form inputs)
- Use `isEqual` to prevent unnecessary writes for complex objects
- Consider using LocalStorage for small, frequently accessed data
- Use file storage for large datasets that don't change often

## License

This project is licensed under the Beerware License. See the `LICENSE` file for the full text.
