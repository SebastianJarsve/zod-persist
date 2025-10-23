# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-10-23

### 📝 Documentation

- Fix installation instructions to use npm registry instead of GitHub URL
- Update all package manager examples (npm, pnpm, bun)

[1.0.2]: https://github.com/SebastianJarsve/zod-persist/releases/tag/v1.0.2

## [1.0.1] - 2025-10-23

### 🐛 Bug Fixes

- **Critical: Race condition prevention** - Block `.set()` calls until hydration completes to prevent data loss from writes overwriting loaded state
- **Critical: Schema validation errors** - Throw ZodError directly instead of silently failing, giving users full validation details
- **Critical: Write error handling** - Make `write()` throw errors and catch them in subscriptions; allow `flush()` to propagate errors to caller
- **React cleanup** - Add cleanup effect to `useAtom` hook to flush pending writes on component unmount, preventing data loss with debouncing
- **LocalStorage adapter** - Normalize null to undefined for consistency across storage backends (browser localStorage vs Raycast LocalStorage)

### Changed

- `.setAndFlush()` now requires explicit `await $atom.ready` first (was previously implicit)
- `write()` now throws errors instead of silently swallowing them
- Both `getItem()` and `setItem()` in LocalStorage adapter are now explicitly async

### Improved

- Better error messages when `.set()` is called before hydration
- Explicit error handling in all async operations
- More robust storage adapter behavior

## [1.0.0] - 2025-10-08

### 🎉 Initial Release

A framework-agnostic state persistence library for Nanostores with built-in Zod validation, migrations, and error recovery.

### Added

- **Persistent Atoms**: Create persistent Nanostores atoms with automatic storage synchronization
- **Built-in Zod Validation**: Automatic schema validation on read and write operations via the `schema` option
- **Data Migrations**: Version your data with the `version` and `migrations` options for seamless schema upgrades
- **Corruption Recovery**: `onCorruption` handler for graceful error recovery with automatic backups
- **File Adapter**: `createFileAdapter` for file system persistence
- **Generic LocalStorage Adapter**: `createLocalStorageAdapter` that works with any LocalStorage-like interface
- **Debounced Writes**: Optional `debounceMs` for performance optimization
- **Custom Equality Checks**: `isEqual` option to prevent unnecessary writes
- **TypeScript Support**: Full type safety with generics
- **React Integration**: Works seamlessly with `@nanostores/react`
- **Framework Examples**: Examples for Raycast, Browser/React, and Node.js/Electron
- **Comprehensive Documentation**: README.md and EXAMPLES.md with 11 detailed examples

### Features

- ✅ Framework-agnostic (works with Raycast, browser, Node.js, Electron, etc.)
- ✅ Type-safe with TypeScript
- ✅ Automatic versioning and migrations
- ✅ Automatic backup creation on corruption
- ✅ Async hydration with `.ready` promise
- ✅ Flexible storage adapter system
- ✅ Custom serialization/deserialization support

[1.0.0]: https://github.com/SebastianJarsve/zod-persist/releases/tag/v1.0.0
