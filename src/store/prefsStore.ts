import { create } from 'zustand'
import { LANGS, type Lang } from '@/core/lang'
import { readEnum, storage, STORAGE_KEYS } from '@/lib/storage'

export type ThemePref = 'system' | 'light' | 'dark'
const THEMES = ['system', 'light', 'dark'] as const

interface PrefsState {
  lang: Lang
  theme: ThemePref
  /** TTS muted. Default: voice on (the robot only ever speaks right after a user action). */
  muted: boolean
  setLang(lang: Lang): void
  setTheme(theme: ThemePref): void
  setMuted(muted: boolean): void
}

/**
 * Per-viewer preferences, persisted to localStorage under the nckh:* keys. The inline script in
 * index.html reads the same keys before first paint so the theme and <html lang> never flash.
 * A zustand store (not React context) so the engine and non-React code can read it too.
 */
export const usePrefs = create<PrefsState>()((set) => ({
  lang: typeof window === 'undefined' ? 'vi' : readEnum(STORAGE_KEYS.lang, LANGS, 'vi'),
  theme: typeof window === 'undefined' ? 'system' : readEnum(STORAGE_KEYS.theme, THEMES, 'system'),
  muted: typeof window === 'undefined' ? false : storage.get(STORAGE_KEYS.muted) === '1',
  setLang: (lang) => {
    storage.set(STORAGE_KEYS.lang, lang)
    set({ lang })
  },
  setTheme: (theme) => {
    storage.set(STORAGE_KEYS.theme, theme)
    set({ theme })
  },
  setMuted: (muted) => {
    storage.set(STORAGE_KEYS.muted, muted ? '1' : '0')
    set({ muted })
  },
}))

/** Non-React access (engine, speech). */
export const getPrefs = () => usePrefs.getState()
