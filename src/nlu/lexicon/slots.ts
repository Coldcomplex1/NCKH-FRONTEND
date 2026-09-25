import type { DayOffset } from '@/core/actions'

/** Day words (spec §4.1 DAY). "hôm qua" is kept for date questions; weather clamps it to today. */
export const DAYS: readonly { phrases: readonly string[]; offset: DayOffset }[] = [
  { offset: 0, phrases: ['hôm nay', 'nay', 'ngày hôm nay', 'bữa nay', 'ngày nay'] },
  { offset: 1, phrases: ['ngày mai', 'mai', 'sáng|trưa|chiều|tối mai', 'hôm sau', 'ngày hôm sau'] },
  { offset: 2, phrases: ['ngày mốt', 'mốt', 'ngày kia', 'bữa mốt'] },
  { offset: -1, phrases: ['hôm qua', 'ngày hôm qua', 'hôm trước'] },
]

/**
 * Repeat counts (spec §6). `n` is a fixed count; `num` takes the number; `again` marks "lần nữa";
 * `forever` ("mãi", "hoài") is capped to LIMITS.maxCount with a note.
 */
export type CountValue =
  { kind: 'num'; again?: boolean } | { kind: 'fixed'; n: number; again?: boolean } | { kind: 'forever' }

export const COUNTS: readonly { phrases: readonly string[]; value: CountValue }[] = [
  { phrases: ['# lần|cái|phát|bận|lượt|cú|lượt|nhát|hồi'], value: { kind: 'num' } },
  { phrases: ['thêm # lần|cái', '# lần nữa', 'thêm # lần nữa'], value: { kind: 'num', again: true } },
  { phrases: ['vài lần|cái|phát', 'mấy lần|cái|phát', 'dăm lần'], value: { kind: 'fixed', n: 3 } },
  { phrases: ['nhiều lần', 'nhiều cái', 'thật nhiều'], value: { kind: 'fixed', n: 5 } },
  {
    phrases: ['lần nữa', 'thêm lần nữa', 'thêm cái nữa', 'thêm phát nữa'],
    value: { kind: 'fixed', n: 1, again: true },
  },
  {
    phrases: ['mãi', 'mãi mãi', 'liên tục', 'không ngừng', 'liên tục không ngừng'],
    value: { kind: 'forever' },
  },
]

/** Walking steps. */
export const STEPS: readonly { phrases: readonly string[]; n?: number }[] = [
  { phrases: ['# bước', '# bước chân'] },
  { phrases: ['vài bước', 'mấy bước', 'dăm bước'], n: 3 },
  { phrases: ['một chút', 'một tí'], n: 2 },
]

/**
 * Duration pieces (spec §4.3 Duration): seconds per unit; `half` adds half a unit ("rưỡi"),
 * `halfOnly` is "nửa X". Adjacent pieces are summed ("1 phút 30 giây").
 */
export const DURATIONS: readonly {
  phrases: readonly string[]
  unit: number
  half?: boolean
  halfOnly?: boolean
}[] = [
  { phrases: ['# giây', '# giây đồng hồ'], unit: 1 },
  { phrases: ['# phút'], unit: 60 },
  { phrases: ['# phút rưỡi'], unit: 60, half: true },
  { phrases: ['# giờ|tiếng', '# tiếng đồng hồ'], unit: 3600 },
  { phrases: ['# giờ|tiếng rưỡi', '# tiếng rưỡi đồng hồ'], unit: 3600, half: true },
  // bare "tiếng rưỡi" / "phút rưỡi" = one and a half units
  { phrases: ['tiếng rưỡi', 'tiếng rưỡi đồng hồ'], unit: 3600, half: true },
  { phrases: ['phút rưỡi'], unit: 60, half: true },
  { phrases: ['nửa phút'], unit: 60, halfOnly: true },
  { phrases: ['nửa giờ|tiếng', 'nửa tiếng đồng hồ'], unit: 3600, halfOnly: true },
]
