// tsup.config.ts (Final Configuration)
import { defineConfig } from 'tsup'

export default defineConfig({
  // Map all source files to their corresponding paths in the dist directory
  entry: {
    // Top-Level Entry Points
    index: 'src/index.ts',

    // Core Files (Needed to resolve relative imports in index.ts)
    'persistent-atom': 'src/persistent-atom.ts',

    // Adapters Entry Points (Barrel file + individual files)
    'adapters/index': 'src/adapters/index.ts',
    'adapters/file-adapter': 'src/adapters/file-adapter.ts', // FIX for resolve error 1
    'adapters/local-storage-adapter': 'src/adapters/local-storage-adapter.ts', // FIX for resolve error 2

    // React Entry Points
    'react/index': 'src/react/index.ts',
    'react/react-hook': 'src/react/react-hook.ts', // FIX for resolve error 4
  },

  // Standard library settings
  format: ['esm'],
  target:"esnext",
  clean: true,
  dts: true,
  bundle: false, // Ensures internal imports are preserved

  // Dependencies that should NOT be bundled but resolved by the consumer's node_modules
  external: [
    'nanostores',
    'zod',
    '@nanostores/react',
    // Node.js Built-ins (Crucial for createFileAdapter)
    'path',
    'fs/promises',
  ],
})
