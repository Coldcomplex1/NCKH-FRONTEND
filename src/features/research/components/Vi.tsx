import type { ReactNode } from 'react'

/**
 * Wraps a Vietnamese word/name/phrase quoted inside otherwise non-Vietnamese copy, so screen
 * readers pronounce it correctly instead of using the ambient (English) language's phonetics.
 */
export function Vi({ children }: { children: ReactNode }) {
  return <span lang="vi">{children}</span>
}
