import type { ChipCategory } from '@/components/ui'

/**
 * Example command chips. The Vietnamese strings are FIXED by the build brief: the NLU tests parse
 * every one of them, so do not edit a `vi` value without updating src/nlu's tests too.
 */
export type ExampleCategory = Exclude<ChipCategory, 'neutral'>
/** Why a dialect chip is interesting (shown as a small tag). */
export type ExampleTag = 'central' | 'southern' | 'ngheTinh' | 'ascii'

export interface ExampleChip {
  /** The command sent to the robot (always Vietnamese). */
  vi: string
  /** Short English gloss shown under the command in the English UI. */
  en: string
  tag?: ExampleTag
}

export interface ExampleGroup {
  category: ExampleCategory
  chips: ExampleChip[]
}

export const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    category: 'motion',
    chips: [
      { vi: 'nhảy lên', en: 'jump' },
      { vi: 'nhảy ba lần rồi vẫy tay', en: 'jump three times, then wave' },
      { vi: 'nhảy múa đi', en: 'dance' },
      { vi: 'quay một vòng', en: 'spin around once' },
      { vi: 'ngồi xuống', en: 'sit down' },
      { vi: 'đi sang trái', en: 'walk to the left' },
    ],
  },
  {
    category: 'info',
    chips: [
      { vi: 'mấy giờ rồi?', en: 'what time is it?' },
      { vi: 'hôm nay thứ mấy?', en: 'what day is it today?' },
      { vi: 'hôm nay âm lịch ngày mấy?', en: "what's today's lunar date?" },
      { vi: 'hẹn giờ 1 phút', en: 'set a 1-minute timer' },
      { vi: 'thời tiết ở Huế thế nào?', en: "what's the weather in Huế?" },
    ],
  },
  {
    category: 'chat',
    chips: [
      { vi: 'xin chào', en: 'hello' },
      { vi: 'bạn là ai?', en: 'who are you?' },
      { vi: 'bạn làm được gì?', en: 'what can you do?' },
      { vi: 'kể chuyện cười đi', en: 'tell me a joke' },
      { vi: '5 cộng 3 bằng mấy?', en: 'what is 5 plus 3?' },
    ],
  },
  {
    category: 'home',
    chips: [
      { vi: 'bật đèn', en: 'turn on the light' },
      { vi: 'đổi đèn sang màu xanh dương', en: 'make the light blue' },
      { vi: 'bật quạt số 3', en: 'fan on, speed 3' },
      { vi: 'tắt đèn', en: 'turn off the light' },
    ],
  },
  {
    category: 'dialect',
    chips: [
      { vi: 'chừ mấy giờ rồi rứa?', en: 'what time is it now?', tag: 'central' },
      { vi: 'mở đèn lên coi', en: 'turn the light on', tag: 'southern' },
      { vi: 'bựa ni thứ mấy?', en: 'what day is it today?', tag: 'ngheTinh' },
      { vi: 'mi làm được chi?', en: 'what can you do?', tag: 'central' },
      { vi: 'quẹo trái', en: 'turn left', tag: 'southern' },
      { vi: 'bat quat len', en: 'turn the fan on (no diacritics)', tag: 'ascii' },
    ],
  },
  {
    category: 'limit',
    chips: [{ vi: 'ăn một quả chuối', en: 'eat a banana' }],
  },
]

/** Flat list of every example command (tests, suggestions). */
export const ALL_EXAMPLES: string[] = EXAMPLE_GROUPS.flatMap((g) => g.chips.map((c) => c.vi))
