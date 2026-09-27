import type { DialectRegion, SubstitutionKind } from '@/core/parser'
import type { StageId, StageState, TurnSource } from '@/store/demoStore'
import { project } from '@/content/project'
import { ENV } from '@/lib/env'
import type { ExampleCategory, ExampleTag } from './input-panel/examples'

/** UI strings for the demo section (robot panel + input panel). Audio strings: audio-tab/dict.ts. */

const bot = project.botName

type TranscriptStatus =
  'hearing' | 'thinking' | 'creating' | 'ok' | 'partial' | 'impossible' | 'unknown' | 'error' | 'interrupted'

const vi = {
  section: {
    title: 'Robot hiểu giọng miền — ra lệnh bằng tiếng Việt',
  },

  robot: {
    panelLabel: `Robot ${bot} trong căn phòng 3D`,
    loading: 'Đang tải robot…',
    loadingHint: 'Bạn vẫn có thể gõ lệnh trong lúc chờ.',
    stageError: 'Không tải được robot 3D.',
    stageErrorHint: 'Robot vẫn trả lời bằng chữ. Bạn có thể thử tải lại trang.',
    reload: 'Tải lại trang',
    botName: bot,
    speaking: 'Đang nói',
  },

  card: {
    label: 'Thẻ thông tin',
    close: 'Đóng thẻ',
    titles: {
      time: 'Bây giờ là',
      date: 'Ngày tháng',
      lunar: 'Âm lịch',
      weather: 'Thời tiết',
      math: 'Phép tính',
      capabilities: `${bot} làm được`,
      about: `Về ${bot}`,
    },
    dayOffset: { '-1': 'Hôm qua', '0': 'Hôm nay', '1': 'Ngày mai', '2': 'Ngày kia' },
    partOfDay: {
      morning: 'buổi sáng',
      noon: 'buổi trưa',
      afternoon: 'buổi chiều',
      evening: 'buổi tối',
      night: 'ban đêm',
    },
    vnTime: 'Giờ Việt Nam',
    lunarDate: (day: number, month: number, leap: boolean): string =>
      `Ngày ${day} tháng ${month}${leap ? ' (nhuận)' : ''}`,
    lunarYear: (canChi: string, animal: string): string => `Năm ${canChi} · con ${animal}`,
    solarLine: (date: string): string => `Dương lịch: ${date}`,
    lunarLine: (day: number, month: number, canChi: string): string =>
      `Âm lịch: ${day}/${month} năm ${canChi}`,
    festival: (name: string): string => `Hôm đó là ${name}`,
    untilTet: (days: number): string =>
      days === 0 ? 'Hôm nay là mùng 1 Tết!' : `Còn ${days} ngày nữa là Tết`,
    untilRam: (days: number): string => (days === 0 ? 'Hôm nay là ngày rằm' : `Còn ${days} ngày nữa là rằm`),
    untilMung1: (days: number): string =>
      days === 0 ? 'Hôm nay là mùng 1' : `Còn ${days} ngày nữa là mùng 1`,
    on: (date: string): string => `vào ${date}`,
    weather: {
      loading: (place: string): string => `Đang xem thời tiết ở ${place}…`,
      error: (place: string): string => `Chưa lấy được thời tiết ở ${place}. Bạn thử lại sau nhé.`,
      now: 'Bây giờ',
      feelsLike: 'Cảm giác như',
      humidity: 'Độ ẩm',
      wind: 'Gió',
      rainChance: 'Khả năng mưa',
      highLow: 'Cao nhất / thấp nhất',
      attribution: 'Weather data by Open-Meteo.com',
      attributionLabel: 'Weather data by Open-Meteo.com (mở trong thẻ mới)',
    },
    math: {
      div0: 'Không chia cho 0 được',
      overflow: 'Số lớn quá, mình không tính được',
    },
    capabilities: [
      'Cử động: nhảy, múa, vẫy tay, gật đầu, đi, chạy, ngồi, quay…',
      'Giờ, ngày, thứ, âm lịch và hẹn giờ',
      'Thời tiết của 63 tỉnh thành',
      'Tính cộng, trừ, nhân, chia',
      'Bật/tắt đèn, đổi màu đèn, bật quạt',
      'Chào hỏi, trò chuyện, kể chuyện cười',
    ],
    about: [
      `Mình là ${bot}, robot của nhóm ${project.team}.`,
      'Mình hiểu lệnh tiếng Việt, kể cả từ địa phương như “chừ”, “rứa”, “mô”, “coi”… và chữ không dấu.',
      ENV.asr.enabled
        ? 'Bạn có thể gõ lệnh hoặc bấm mic để nói với mình.'
        : 'Đôi tai của mình (PhoWhisper-large tinh chỉnh trên ViMD) sắp có. Bây giờ bạn gõ lệnh cho mình nhé.',
    ],
  },

  timer: {
    label: 'Hẹn giờ',
    ringing: 'Hết giờ!',
    remaining: (t: string): string => `còn ${t}`,
    cancel: (t: string): string => `Hủy hẹn giờ (còn ${t})`,
    dismiss: 'Tắt chuông hẹn giờ',
  },

  room: {
    label: 'Trạng thái căn phòng',
    light: 'Đèn',
    fan: 'Quạt',
    on: 'bật',
    off: 'tắt',
    dimmed: 'dịu',
    speed: (n: number): string => `số ${n}`,
  },

  voiceNotice: {
    title: (langName: string): string => `Máy này chưa có giọng đọc ${langName}`,
    body: 'Robot sẽ chỉ hiện chữ, không đọc thành tiếng.',
    how: 'Cách cài thêm giọng đọc',
    steps: [
      'Windows: Cài đặt → Thời gian & ngôn ngữ → Giọng nói → Thêm giọng nói.',
      'macOS: Cài đặt hệ thống → Trợ năng → Nội dung được đọc → Giọng hệ thống → Quản lý giọng.',
      'Android: Cài đặt → Chuyển văn bản thành giọng nói → Google → tải ngôn ngữ.',
      'Hoặc mở trang bằng Microsoft Edge (có sẵn giọng tiếng Việt).',
    ],
    langNames: { vi: 'tiếng Việt', en: 'tiếng Anh' },
    dismiss: 'Đã hiểu',
  },

  tabs: {
    label: 'Cách ra lệnh cho robot',
    text: 'Văn bản',
    voice: 'Giọng nói',
    soon: 'Sắp có',
    offline: 'Tạm nghỉ',
  },

  composer: {
    label: 'Nhập lệnh cho robot',
    placeholder: 'Ví dụ: nhảy ba lần rồi vẫy tay',
    send: 'Gửi',
    hint: 'Enter để gửi · Shift+Enter xuống dòng',
    vietnameseOnly: '',
    counter: (n: number, max: number): string => `${n}/${max} ký tự`,
  },

  chips: {
    heading: 'Gợi ý lệnh',
    intro: 'Bấm vào một lệnh, robot sẽ làm ngay.',
    categories: {
      motion: 'Cử động',
      info: 'Thông tin',
      chat: 'Trò chuyện',
      home: 'Nhà thông minh',
      dialect: 'Giọng miền',
      limit: 'Thử giới hạn',
    } satisfies Record<ExampleCategory, string>,
    tags: {
      central: 'miền Trung',
      southern: 'miền Nam',
      ngheTinh: 'Nghệ Tĩnh',
      ascii: 'không dấu',
    } satisfies Record<ExampleTag, string>,
  },

  transcript: {
    title: 'Robot nghe được',
    empty: 'Robot chưa nhận lệnh nào. Hãy gõ lệnh hoặc bấm một gợi ý.',
    hearing: 'Đang nhận dạng giọng nói…',
    sourceLabel: 'Nguồn',
    sources: {
      text: 'Gõ phím',
      chip: 'Bấm gợi ý',
      mic: 'Ghi âm',
      file: 'Tệp âm thanh',
    } satisfies Record<TurnSource, string>,
    status: {
      hearing: 'Đang nghe',
      thinking: 'Đang hiểu',
      creating: 'Qwen đang nghĩ động tác…',
      ok: 'Đã hiểu',
      partial: 'Hiểu một phần',
      impossible: 'Không làm được',
      unknown: 'Chưa hiểu',
      error: 'Lỗi',
      interrupted: 'Đã dừng',
    } satisfies Record<TranscriptStatus, string>,
    statusLabel: 'Trạng thái',
    asrLine: 'Nhận dạng (ASR)',
    qwenLine: 'Sau hiệu chỉnh hậu kỳ (Qwen)',
    understood: 'Robot hiểu là',
    dialectBadge: 'Từ địa phương',
    dialectList: 'Từ địa phương đã nhận ra',
    otherList: 'Đã chuẩn hóa',
    kinds: {
      dialect: 'từ địa phương',
      spelling: 'thêm dấu / chính tả',
      chat: 'kiểu chat',
      fuzzy: 'gõ nhầm',
      phonetic: 'phát âm',
    } satisfies Record<SubstitutionKind, string>,
    intents: 'Việc robot sẽ làm',
    noIntents: 'Chưa tìm thấy việc nào robot làm được.',
    suggestions: 'Có phải bạn muốn:',
    errorTitle: 'Có lỗi xảy ra',
    replies: `${bot} trả lời`,
    means: 'nghĩa là',
    order: (n: number): string => `Bước ${n}`,
    aiBadge: 'Qwen tạo động tác',
    aiBadgeShort: 'Qwen',
  },

  ai: {
    disclosure: 'Lệnh robot chưa biết sẽ được gửi tới Qwen (Alibaba Cloud) để nghĩ ra động tác mới.',
    heading: 'Động tác mới do Qwen nghĩ ra',
  },

  regions: {
    central: 'miền Trung',
    ngheTinh: 'Nghệ Tĩnh',
    hue: 'Huế',
    quang: 'Quảng Nam',
    southern: 'miền Nam',
  } satisfies Record<DialectRegion, string>,

  pipeline: {
    label: 'Các bước xử lý',
    steps: {
      input: 'Đầu vào',
      asr: 'Nhận dạng giọng nói (ASR)',
      qwen: 'Hiệu chỉnh hậu kỳ (Qwen)',
      nlu: 'Hiểu lệnh (NLU)',
      robot: 'Robot',
    } satisfies Record<StageId, string>,
    short: { input: 'Đầu vào', asr: 'ASR', qwen: 'Qwen', nlu: 'NLU', robot: 'Robot' } satisfies Record<
      StageId,
      string
    >,
    states: {
      idle: 'chờ',
      active: 'đang chạy',
      done: 'xong',
      skipped: 'bỏ qua',
      error: 'lỗi',
      soon: 'sắp có',
    } satisfies Record<StageState, string>,
  },

  history: {
    title: 'Lịch sử',
    subtitle: (n: number): string => `${n} lệnh gần nhất`,
    empty: 'Chưa có lệnh nào.',
    clear: 'Xóa lịch sử',
    you: 'Bạn',
    robot: bot,
    at: (time: string): string => `lúc ${time}`,
    interrupted: 'Đã dừng giữa chừng',
    error: 'Có lỗi',
    processing: 'Đang xử lý…',
  },
}

const en: typeof vi = {
  section: {
    title: 'A robot that understands regional accents — give it commands in Vietnamese',
  },

  robot: {
    panelLabel: `${bot} the robot in a 3D room`,
    loading: 'Loading the robot…',
    loadingHint: 'You can type a command while you wait.',
    stageError: 'The 3D robot could not be loaded.',
    stageErrorHint: 'The robot still answers in text. You can try reloading the page.',
    reload: 'Reload the page',
    botName: bot,
    speaking: 'Speaking',
  },

  card: {
    label: 'Info card',
    close: 'Close the card',
    titles: {
      time: 'The time is',
      date: 'Date',
      lunar: 'Lunar calendar',
      weather: 'Weather',
      math: 'Calculation',
      capabilities: `${bot} can`,
      about: `About ${bot}`,
    },
    dayOffset: { '-1': 'Yesterday', '0': 'Today', '1': 'Tomorrow', '2': 'The day after tomorrow' },
    partOfDay: {
      morning: 'morning',
      noon: 'noon',
      afternoon: 'afternoon',
      evening: 'evening',
      night: 'night',
    },
    vnTime: 'Vietnam time',
    lunarDate: (day, month, leap) => `Day ${day} of month ${month}${leap ? ' (leap)' : ''}`,
    lunarYear: (canChi, animal) => `Year of ${canChi} · the ${animal}`,
    solarLine: (date) => `Gregorian: ${date}`,
    lunarLine: (day, month, canChi) => `Lunar: ${day}/${month}, year of ${canChi}`,
    festival: (name) => `That day is ${name}`,
    untilTet: (days) => (days === 0 ? 'Today is Lunar New Year!' : `${days} days until Tết`),
    untilRam: (days) =>
      days === 0 ? 'Today is the full-moon day' : `${days} days until the full moon (rằm)`,
    untilMung1: (days) =>
      days === 0 ? 'Today is the 1st of the lunar month' : `${days} days until the new moon`,
    on: (date) => `on ${date}`,
    weather: {
      loading: (place) => `Checking the weather in ${place}…`,
      error: (place) => `Couldn't get the weather for ${place}. Please try again later.`,
      now: 'Now',
      feelsLike: 'Feels like',
      humidity: 'Humidity',
      wind: 'Wind',
      rainChance: 'Chance of rain',
      highLow: 'High / low',
      attribution: 'Weather data by Open-Meteo.com',
      attributionLabel: 'Weather data by Open-Meteo.com (opens in a new tab)',
    },
    math: {
      div0: "Can't divide by zero",
      overflow: 'That number is too big for me',
    },
    capabilities: [
      'Move: jump, dance, wave, nod, walk, run, sit, turn…',
      'Time, date, weekday, lunar calendar and timers',
      'Weather for all 63 provinces',
      'Add, subtract, multiply, divide',
      'Turn the light on/off, change its colour, run the fan',
      'Say hello, chat, tell jokes',
    ],
    about: [
      `I'm ${bot}, team ${project.team}'s robot.`,
      'I understand Vietnamese commands, including regional words like “chừ”, “rứa”, “mô”, “coi”… and text without diacritics.',
      ENV.asr.enabled
        ? 'You can type or tap the mic to talk to me.'
        : 'My ears (PhoWhisper-large fine-tuned on ViMD) are coming soon. For now, please type to me.',
    ],
  },

  timer: {
    label: 'Timer',
    ringing: "Time's up!",
    remaining: (t) => `${t} left`,
    cancel: (t) => `Cancel the timer (${t} left)`,
    dismiss: 'Stop the timer alarm',
  },

  room: {
    label: 'Room status',
    light: 'Light',
    fan: 'Fan',
    on: 'on',
    off: 'off',
    dimmed: 'dimmed',
    speed: (n) => `speed ${n}`,
  },

  voiceNotice: {
    title: (langName) => `This device has no ${langName} voice`,
    body: 'The robot will show its replies as text only.',
    how: 'How to add a voice',
    steps: [
      'Windows: Settings → Time & language → Speech → Add voices.',
      'macOS: System Settings → Accessibility → Spoken Content → System voice → Manage voices.',
      'Android: Settings → Text-to-speech → Google → install voice data.',
      'Or open this page in Microsoft Edge (it includes Vietnamese voices).',
    ],
    langNames: { vi: 'Vietnamese', en: 'English' },
    dismiss: 'Got it',
  },

  tabs: {
    label: 'How to give the robot a command',
    text: 'Text',
    voice: 'Voice',
    soon: 'Coming soon',
    offline: 'Offline',
  },

  composer: {
    label: 'Type a command for the robot',
    placeholder: 'nhảy ba lần rồi vẫy tay',
    send: 'Send',
    hint: 'Enter to send · Shift+Enter for a new line',
    vietnameseOnly: 'Commands are in Vietnamese — try an example below.',
    counter: (n, max) => `${n}/${max} characters`,
  },

  chips: {
    heading: 'Try these commands',
    intro: 'Tap a command and the robot does it right away. Commands are in Vietnamese.',
    categories: {
      motion: 'Movement',
      info: 'Information',
      chat: 'Chat',
      home: 'Smart home',
      dialect: 'Regional speech',
      limit: 'Test the limits',
    },
    tags: {
      central: 'Central',
      southern: 'Southern',
      ngheTinh: 'Nghệ Tĩnh',
      ascii: 'no diacritics',
    },
  },

  transcript: {
    title: 'What the robot heard',
    empty: 'No command yet. Type one or tap an example.',
    hearing: 'Recognising speech…',
    sourceLabel: 'Source',
    sources: {
      text: 'Typed',
      chip: 'Example',
      mic: 'Recording',
      file: 'Audio file',
    },
    status: {
      hearing: 'Listening',
      thinking: 'Understanding',
      creating: 'Qwen is inventing a move…',
      ok: 'Understood',
      partial: 'Partly understood',
      impossible: "Can't do that",
      unknown: 'Not understood',
      error: 'Error',
      interrupted: 'Stopped',
    },
    statusLabel: 'Status',
    asrLine: 'Recognised (ASR)',
    qwenLine: 'Corrected (Qwen)',
    understood: 'The robot understood',
    dialectBadge: 'Regional words',
    dialectList: 'Regional words recognised',
    otherList: 'Also normalised',
    kinds: {
      dialect: 'regional word',
      spelling: 'diacritics / spelling',
      chat: 'chat spelling',
      fuzzy: 'typo',
      phonetic: 'pronunciation',
    },
    intents: 'What the robot will do',
    noIntents: 'Nothing the robot can do was found.',
    suggestions: 'Did you mean:',
    errorTitle: 'Something went wrong',
    replies: `${bot} replied`,
    means: 'means',
    order: (n) => `Step ${n}`,
    aiBadge: 'Made by Qwen',
    aiBadgeShort: 'Qwen',
  },

  ai: {
    disclosure: "Commands the robot doesn't know are sent to Qwen (Alibaba Cloud) to invent a new move.",
    heading: 'New moves invented by Qwen',
  },

  regions: {
    central: 'Central',
    ngheTinh: 'Nghệ Tĩnh',
    hue: 'Huế',
    quang: 'Quảng Nam',
    southern: 'Southern',
  },

  pipeline: {
    label: 'Processing steps',
    steps: {
      input: 'Input',
      asr: 'Speech recognition (ASR)',
      qwen: 'Correction (Qwen)',
      nlu: 'Understanding (NLU)',
      robot: 'Robot',
    },
    short: { input: 'Input', asr: 'ASR', qwen: 'Qwen', nlu: 'NLU', robot: 'Robot' },
    states: {
      idle: 'waiting',
      active: 'running',
      done: 'done',
      skipped: 'skipped',
      error: 'error',
      soon: 'coming soon',
    },
  },

  history: {
    title: 'History',
    subtitle: (n) => `Last ${n} commands`,
    empty: 'No commands yet.',
    clear: 'Clear history',
    you: 'You',
    robot: bot,
    at: (time) => `at ${time}`,
    interrupted: 'Stopped part-way',
    error: 'Error',
    processing: 'Working…',
  },
}

export const demoDict = { vi, en }
export type DemoDict = typeof vi
export type { TranscriptStatus }
