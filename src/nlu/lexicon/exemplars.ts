import type { Suggestion } from '@/core/parser'

/**
 * "Did you mean" exemplars (spec §5 Suggestions). `say` is always a Vietnamese command the parser
 * understands (tested); `label` is shown on the chip in the UI language.
 */
export interface Exemplar extends Suggestion {
  intent: string
}

const ex = (intent: string, say: string, en: string): Exemplar => ({ intent, say, label: { vi: say, en } })

export const EXEMPLARS: readonly Exemplar[] = [
  ex('jump', 'nhảy 3 lần', 'Jump 3 times'),
  ex('jump', 'nhảy lên', 'Jump'),
  ex('dance', 'nhảy múa đi', 'Dance'),
  ex('wave', 'vẫy tay', 'Wave'),
  ex('wave', 'vẫy tay chào', 'Wave hello'),
  ex('nod', 'gật đầu', 'Nod'),
  ex('shake_head', 'lắc đầu', 'Shake head'),
  ex('thumbs_up', 'giơ ngón cái', 'Thumbs up'),
  ex('punch', 'đấm ba phát', 'Punch 3 times'),
  ex('walk', 'đi tới 3 bước', 'Walk 3 steps'),
  ex('walk', 'đi sang trái', 'Walk left'),
  ex('walk', 'lại đây', 'Come here'),
  ex('walk', 'về chỗ cũ', 'Go back to your spot'),
  ex('walk', 'lùi lại', 'Step back'),
  ex('run', 'chạy tại chỗ', 'Run on the spot'),
  ex('turn', 'quay một vòng', 'Spin around'),
  ex('turn', 'quay trái', 'Turn left'),
  ex('sit', 'ngồi xuống', 'Sit down'),
  ex('stand', 'đứng lên', 'Stand up'),
  ex('sleep', 'đi ngủ', 'Go to sleep'),
  ex('wake', 'thức dậy', 'Wake up'),
  ex('fall', 'giả chết', 'Play dead'),
  ex('stop', 'dừng lại', 'Stop'),
  ex('emote', 'cười lên', 'Smile'),
  ex('emote', 'làm mặt buồn', 'Make a sad face'),
  ex('time', 'mấy giờ rồi', 'What time is it?'),
  ex('date', 'hôm nay ngày mấy', "What's the date?"),
  ex('weekday', 'hôm nay thứ mấy', 'What day is it?'),
  ex('lunar', 'hôm nay âm lịch ngày mấy', 'Lunar date today'),
  ex('lunar', 'năm nay là năm con gì', 'Zodiac year'),
  ex('lunar', 'còn bao nhiêu ngày nữa đến tết', 'Days until Tết'),
  ex('timer', 'hẹn giờ 1 phút', 'Set a 1-minute timer'),
  ex('timer', 'hủy hẹn giờ', 'Cancel the timer'),
  ex('weather', 'thời tiết hôm nay thế nào', "Today's weather"),
  ex('weather', 'ngày mai có mưa không', 'Rain tomorrow?'),
  ex('math', '5 cộng 3 bằng mấy', 'What is 5 plus 3?'),
  ex('greet', 'xin chào', 'Say hello'),
  ex('thanks', 'cảm ơn', 'Say thanks'),
  ex('goodbye', 'tạm biệt', 'Say goodbye'),
  ex('intro', 'bạn là ai', 'Who are you?'),
  ex('capabilities', 'bạn làm được gì', 'What can you do?'),
  ex('joke', 'kể chuyện cười', 'Tell a joke'),
  ex('smalltalk', 'bạn khỏe không', 'How are you?'),
  ex('light', 'bật đèn', 'Light on'),
  ex('light', 'tắt đèn', 'Light off'),
  ex('light', 'đổi đèn sang màu đỏ', 'Red light'),
  ex('fan', 'bật quạt', 'Fan on'),
  ex('fan', 'bật quạt số 3', 'Fan speed 3'),
  ex('fan', 'tắt quạt', 'Fan off'),
  ex('voice', 'im lặng', 'Mute'),
  ex('set_language', 'nói tiếng anh', 'Speak English'),
]

/** Shown when nothing in the input resembles a command. */
export const DEFAULT_SUGGESTIONS: readonly Suggestion[] = [
  { say: 'nhảy 3 lần', label: { vi: 'nhảy 3 lần', en: 'Jump 3 times' } },
  { say: 'mấy giờ rồi', label: { vi: 'mấy giờ rồi', en: 'What time is it?' } },
  { say: 'bật đèn', label: { vi: 'bật đèn', en: 'Light on' } },
  { say: 'kể chuyện cười', label: { vi: 'kể chuyện cười', en: 'Tell a joke' } },
]

/** Chips for a rule whose slot is missing or ambiguous. */
export const SLOT_SUGGESTIONS = {
  device_on: [
    { say: 'bật đèn', label: { vi: 'bật đèn', en: 'Light on' } },
    { say: 'bật quạt', label: { vi: 'bật quạt', en: 'Fan on' } },
  ],
  device_off: [
    { say: 'tắt đèn', label: { vi: 'tắt đèn', en: 'Light off' } },
    { say: 'tắt quạt', label: { vi: 'tắt quạt', en: 'Fan off' } },
  ],
  light: [
    { say: 'bật đèn', label: { vi: 'bật đèn', en: 'Light on' } },
    { say: 'tắt đèn', label: { vi: 'tắt đèn', en: 'Light off' } },
  ],
  fan: [
    { say: 'bật quạt', label: { vi: 'bật quạt', en: 'Fan on' } },
    { say: 'tắt quạt', label: { vi: 'tắt quạt', en: 'Fan off' } },
  ],
  timer: [
    { say: 'hẹn giờ 1 phút', label: { vi: 'hẹn giờ 1 phút', en: '1-minute timer' } },
    { say: 'hẹn giờ 5 phút', label: { vi: 'hẹn giờ 5 phút', en: '5-minute timer' } },
  ],
  xanh: [
    { say: 'đèn xanh lá', label: { vi: 'đèn xanh lá', en: 'Green light' } },
    { say: 'đèn xanh dương', label: { vi: 'đèn xanh dương', en: 'Blue light' } },
  ],
  user_sad: [{ say: 'kể chuyện cười', label: { vi: 'kể chuyện cười', en: 'Tell a joke' } }],
} as const satisfies Record<string, readonly Suggestion[]>
