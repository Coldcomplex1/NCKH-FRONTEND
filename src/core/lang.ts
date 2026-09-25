export type Lang = 'vi' | 'en'
export const LANGS = ['vi', 'en'] as const satisfies readonly Lang[]
export const LOCALE: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US' }

/** All clock, calendar and lunar values are computed in Vietnam time, regardless of the device time zone. */
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

/** A string in both UI languages. */
export interface Bilingual {
  vi: string
  en: string
}
