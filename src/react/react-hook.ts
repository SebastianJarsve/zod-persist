import { PersistentAtom } from '@/persistent-atom'
import { useStore } from '@nanostores/react'
import { ReadableAtom } from 'nanostores'
import { useEffect, useState } from 'react'

/**
 * A type guard to check if an atom is a PersistentAtom.
 * It now accepts any ReadableAtom.
 */
function isPersistentAtom<T>(atom: ReadableAtom<T>): atom is PersistentAtom<T> {
  // The check remains the same: we just look for the .ready promise.
  return 'ready' in atom
}

/**
 * A smart hook that subscribes to any atom (writable or computed)
 * and automatically handles hydration for persistent atoms.
 *
 * @param atom The Nanostores atom to use.
 * @returns An object with the atom's `value` and its `isHydrated` status.
 */
export function useAtom<T>(atom: ReadableAtom<T>) {
  const value = useStore(atom)
  const [isHydrated, setIsHydrated] = useState(!isPersistentAtom(atom))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (isPersistentAtom(atom)) {
      atom.ready
        .then(() => {
          // We can set the state directly once the promise resolves.
          setIsHydrated(true)
        })
        .catch((error) => {
          if (error instanceof Error) setError(error)
          else setError(error != null ? new Error(String(error)) : null)
        })
    }
  }, [atom])

  return { value, isHydrated, error }
}
