/**
 * localStorage wrapper that never throws (private mode, blocked site data, previews).
 * Use it only for per-viewer conveniences (language, theme, mute).
 */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

export function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = storage.get(key)
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

export const STORAGE_KEYS = {
  lang: 'nckh:lang',
  theme: 'nckh:theme',
  muted: 'nckh:muted',
} as const
