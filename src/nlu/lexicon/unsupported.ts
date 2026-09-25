import type { Action, UnsupportedReason } from '@/core/actions'
import type { Bilingual } from '@/core/lang'

/**
 * Things the robot is asked to do but cannot (spec §5). The robot refuses politely and, where
 * listed, performs a similar action instead. Objects are echoed back ONLY from the whitelist below —
 * arbitrary user text never reaches a reply or TTS (public demo safety).
 */
export interface UnsupportedEntry {
  phrases: readonly string[]
  verb: Bilingual
  reason: UnsupportedReason
  alternative?: Action
  /**
   * The verb used with a whitelisted object ("mua rau" / "buy vegetables", "nấu cháo" / "cook
   * porridge"). Without it the object is left out: "đi chợ rau" and "go shopping vegetables" are
   * not sentences.
   */
  withObject?: Bilingual
}

/** Everyone a request can be for ("đỡ bà dậy", "gọi cho con"). */
const PEOPLE = 'tôi|tui|mình|bà|ông|mẹ|bố|ba|má|con|cháu|anh|chị|em|cô|chú|bác|tao'

const JUMP: Action = { type: 'jump', count: 1 }
const DANCE: Action = { type: 'dance', seconds: 6 }
const WAVE: Action = { type: 'wave', count: 1 }
const PUNCH: Action = { type: 'punch', count: 1 }
const WALK: Action = { type: 'walk', direction: 'forward', steps: 3 }
const JOKE: Action = { type: 'joke' }

export const UNSUPPORTED: readonly UnsupportedEntry[] = [
  {
    phrases: ['ăn', 'ăn cơm', 'ăn uống'],
    verb: { vi: 'ăn', en: 'eat' },
    reason: 'physical',
    withObject: { vi: 'ăn', en: 'eat' },
  },
  { phrases: ['cho ăn'], verb: { vi: 'cho ăn', en: 'feed anyone' }, reason: 'physical' },
  {
    phrases: ['uống', 'nhậu'],
    verb: { vi: 'uống', en: 'drink' },
    reason: 'physical',
    withObject: { vi: 'uống', en: 'drink' },
  },
  { phrases: ['hút thuốc'], verb: { vi: 'hút thuốc', en: 'smoke' }, reason: 'physical' },
  {
    phrases: ['nấu', 'nấu ăn', 'nấu cơm', 'chiên', 'xào', 'luộc', 'nướng', 'rán', 'làm bếp'],
    verb: { vi: 'nấu ăn', en: 'cook' },
    reason: 'physical',
    withObject: { vi: 'nấu', en: 'cook' },
  },
  {
    phrases: ['pha trà|chè|sữa|nước', 'pha cà phê', 'pha'],
    verb: { vi: 'pha đồ uống', en: 'make drinks' },
    reason: 'physical',
    withObject: { vi: 'pha', en: 'make' },
  },
  {
    phrases: ['xoa bóp', 'đấm bóp', 'đấm lưng', 'bóp vai|chân|tay|lưng', 'bóp', 'mát xa', 'massage'],
    verb: { vi: 'xoa bóp', en: 'give massages' },
    reason: 'physical',
  },
  {
    phrases: [`đỡ ${PEOPLE} dậy`, `đỡ ${PEOPLE}`, 'đỡ', 'dìu'],
    verb: { vi: 'đỡ ai dậy', en: 'help anyone up' },
    reason: 'physical',
  },
  {
    phrases: ['rửa bát', 'rửa chén', 'rửa', 'rửa tay'],
    verb: { vi: 'rửa', en: 'wash things' },
    reason: 'physical',
    withObject: { vi: 'rửa', en: 'wash' },
  },
  {
    phrases: ['giặt', 'giặt đồ', 'giặt quần áo', 'phơi đồ', 'phơi quần áo'],
    verb: { vi: 'giặt đồ', en: 'do the laundry' },
    reason: 'physical',
    withObject: { vi: 'giặt', en: 'wash' },
  },
  {
    phrases: ['quét nhà', 'lau nhà', 'dọn nhà', 'dọn dẹp', 'quét', 'lau'],
    verb: { vi: 'dọn dẹp', en: 'clean the house' },
    reason: 'physical',
    withObject: { vi: 'dọn', en: 'clean' },
  },
  { phrases: ['tắm', 'đi tắm', 'gội đầu'], verb: { vi: 'tắm', en: 'take a bath' }, reason: 'physical' },
  {
    phrases: ['đánh răng', 'chải răng'],
    verb: { vi: 'đánh răng', en: 'brush my teeth' },
    reason: 'physical',
  },
  { phrases: ['ngửi', 'nếm'], verb: { vi: 'ngửi', en: 'smell things' }, reason: 'physical' },
  {
    phrases: ['bay', 'bay lên', 'bay lên trời', 'bay đi'],
    verb: { vi: 'bay', en: 'fly' },
    reason: 'physical',
    alternative: JUMP,
  },
  {
    phrases: ['bơi', 'lặn', 'đi bơi'],
    verb: { vi: 'bơi', en: 'swim' },
    reason: 'physical',
    alternative: WALK,
  },
  {
    phrases: ['leo', 'trèo', 'leo cây', 'leo núi'],
    verb: { vi: 'leo trèo', en: 'climb' },
    reason: 'physical',
    alternative: JUMP,
  },
  {
    phrases: ['lái xe', 'chạy xe', 'đi xe', 'đạp xe', 'lái ô tô', 'chở'],
    verb: { vi: 'lái xe', en: 'drive' },
    reason: 'physical',
  },
  {
    phrases: ['mua', 'mua sắm', 'đi chợ', 'đi siêu thị', 'bán', 'đi mua'],
    verb: { vi: 'đi chợ', en: 'go shopping' },
    reason: 'physical',
    withObject: { vi: 'mua', en: 'buy' },
  },
  {
    phrases: ['trả tiền', 'chuyển tiền', 'thanh toán', 'cho tiền'],
    verb: { vi: 'trả tiền', en: 'handle money' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['gọi điện', 'gọi video', 'gọi điện thoại', 'gọi cho', `gọi ${PEOPLE}`, 'gọi điện cho'],
    verb: { vi: 'gọi điện', en: 'make phone calls' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['nhắn tin', 'gửi tin nhắn', 'gửi email', 'gửi thư'],
    verb: { vi: 'nhắn tin', en: 'send messages' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['chụp ảnh', 'chụp hình', 'quay phim', 'quay video'],
    verb: { vi: 'chụp ảnh', en: 'take photos' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['đọc báo', 'đọc sách', 'đọc truyện', 'đọc'],
    verb: { vi: 'đọc', en: 'read' },
    reason: 'out_of_scope',
    withObject: { vi: 'đọc', en: 'read' },
    alternative: JOKE,
  },
  {
    phrases: ['viết', 'vẽ', 'viết chữ', 'vẽ tranh'],
    verb: { vi: 'viết, vẽ', en: 'write or draw' },
    reason: 'physical',
  },
  {
    phrases: ['hát', 'ca', 'ca hát', 'hát # bài', 'hát cho tôi|tui|mình nghe'],
    verb: { vi: 'hát', en: 'sing' },
    reason: 'out_of_scope',
    alternative: DANCE,
  },
  {
    phrases: ['đánh đàn', 'chơi đàn', 'thổi sáo', 'đánh trống', 'chơi nhạc'],
    verb: { vi: 'chơi nhạc cụ', en: 'play instruments' },
    reason: 'physical',
    alternative: DANCE,
  },
  {
    phrases: ['bật|mở|phát|nghe nhạc', 'bật|mở bài hát'],
    verb: { vi: 'mở nhạc', en: 'play music' },
    reason: 'out_of_scope',
    alternative: DANCE,
  },
  {
    phrases: ['cầm', 'lấy', 'nhặt', 'mang', 'đem', 'bê', 'xách', 'đưa cho', 'đưa'],
    verb: { vi: 'cầm đồ', en: 'pick things up' },
    reason: 'physical',
    withObject: { vi: 'lấy', en: 'fetch' },
  },
  {
    phrases: ['tìm', 'tìm giùm|giúp|dùm', 'kiếm', 'tìm đồ'],
    verb: { vi: 'tìm đồ', en: 'find things' },
    reason: 'physical',
    withObject: { vi: 'tìm', en: 'find' },
  },
  {
    phrases: ['ôm', 'hôn', 'ôm tôi|tui|mình'],
    verb: { vi: 'ôm', en: 'hug' },
    reason: 'physical',
    alternative: WAVE,
  },
  { phrases: ['đá', 'đá bóng'], verb: { vi: 'đá', en: 'kick' }, reason: 'physical', alternative: PUNCH },
  {
    phrases: ['trồng cây', 'tưới cây', 'tưới hoa'],
    verb: { vi: 'trồng cây', en: 'garden' },
    reason: 'physical',
  },
  { phrases: ['may vá', 'may áo', 'khâu'], verb: { vi: 'may vá', en: 'sew' }, reason: 'physical' },
  {
    phrases: [
      'đi học',
      'đi làm',
      'đi vệ sinh',
      'đi khám',
      'đi chơi xa',
      'ra ngoài',
      'đi ra ngoài',
      'ra ngoài chơi',
      'đi ra đường',
    ],
    verb: { vi: 'đi ra ngoài', en: 'go out' },
    reason: 'physical',
  },
  { phrases: ['cưới', 'lấy vợ', 'lấy chồng'], verb: { vi: 'cưới', en: 'get married' }, reason: 'physical' },
  {
    phrases: ['chơi game', 'chơi cờ', 'đánh cờ', 'chơi điện tử'],
    verb: { vi: 'chơi cờ', en: 'play games' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['tìm kiếm', 'tra cứu', 'google', 'dịch', 'phiên dịch', 'tra google'],
    verb: { vi: 'tìm kiếm', en: 'search the web' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['đặt vé', 'đặt xe', 'gọi xe', 'đặt đồ ăn', 'đặt hàng'],
    verb: { vi: 'đặt vé, đặt xe', en: 'book things' },
    reason: 'out_of_scope',
  },
  {
    phrases: ['giết', 'bắn', 'chém'],
    verb: { vi: 'làm hại ai', en: 'hurt anyone' },
    reason: 'unsafe',
    alternative: PUNCH,
  },
]

/** "đấm tôi", "đánh bạn": hitting a person → refuse, then punch the air. */
export const UNSAFE: UnsupportedEntry = {
  phrases: [
    // (a `|` group holds single words only: "người ta" is its own phrase)
    'đấm|đánh|đá|giết|bắn|tát|cắn tôi|tui|tao|bạn|người|anh|em|nó|con|cháu|ông|bà|mẹ|bố|ba|má|chị|cô|chú|mày|mình|ai',
    'đấm|đánh|đá|giết|bắn|tát|cắn người ta',
  ],
  verb: { vi: 'đánh người', en: 'hit people' },
  reason: 'unsafe',
  alternative: PUNCH,
}

/** Devices the room does not have (spec DEV_ABSENT). The name is safe to echo; EN names carry their article. */
export interface DeviceEntry {
  phrases: readonly string[]
  name: Bilingual
}

export const ABSENT_DEVICES: readonly DeviceEntry[] = [
  { phrases: ['tivi', 'ti vi', 'truyền hình'], name: { vi: 'tivi', en: 'a TV' } },
  { phrases: ['máy lạnh', 'điều hòa', 'máy điều hòa'], name: { vi: 'máy lạnh', en: 'an air conditioner' } },
  { phrases: ['cửa', 'cửa chính', 'cánh cửa', 'cửa ra vào'], name: { vi: 'cửa', en: 'a door' } },
  { phrases: ['cửa sổ'], name: { vi: 'cửa sổ', en: 'a window' } },
  { phrases: ['rèm', 'rèm cửa', 'màn cửa'], name: { vi: 'rèm cửa', en: 'curtains' } },
  { phrases: ['máy giặt'], name: { vi: 'máy giặt', en: 'a washing machine' } },
  { phrases: ['nồi cơm', 'nồi cơm điện'], name: { vi: 'nồi cơm điện', en: 'a rice cooker' } },
  { phrases: ['bếp', 'bếp ga', 'bếp điện'], name: { vi: 'bếp', en: 'a stove' } },
  { phrases: ['tủ lạnh'], name: { vi: 'tủ lạnh', en: 'a fridge' } },
  { phrases: ['loa', 'radio', 'đài'], name: { vi: 'loa', en: 'a speaker' } },
  { phrases: ['máy tính', 'laptop'], name: { vi: 'máy tính', en: 'a computer' } },
  { phrases: ['wifi', 'mạng'], name: { vi: 'wifi', en: 'Wi-Fi' } },
  { phrases: ['camera'], name: { vi: 'camera', en: 'a camera' } },
  { phrases: ['máy sưởi'], name: { vi: 'máy sưởi', en: 'a heater' } },
  { phrases: ['vòi nước', 'nước nóng', 'bình nóng lạnh'], name: { vi: 'vòi nước', en: 'a water tap' } },
]

/** Verb labels for device_absent refusals. */
export const DEVICE_VERBS = {
  on: { vi: 'bật', en: 'turn on' },
  off: { vi: 'tắt', en: 'turn off' },
  open: { vi: 'mở', en: 'open' },
  close: { vi: 'đóng', en: 'close' },
  use: { vi: 'dùng', en: 'use' },
} as const satisfies Record<string, Bilingual>

/** Nouns that make "mở" mean "open" rather than "switch on". */
export const OPENABLE = ['cửa', 'cửa sổ', 'rèm cửa'] as const

/** Safe objects that MAY be echoed in an unsupported reply ("ăn chuối" → "a banana"). */
export interface ObjectEntry {
  phrases: readonly string[]
  name: Bilingual
}

export const OBJECTS: readonly ObjectEntry[] = [
  { phrases: ['chuối'], name: { vi: 'chuối', en: 'a banana' } },
  { phrases: ['táo'], name: { vi: 'táo', en: 'an apple' } },
  { phrases: ['cam'], name: { vi: 'cam', en: 'an orange' } },
  { phrases: ['xoài'], name: { vi: 'xoài', en: 'a mango' } },
  { phrases: ['dưa hấu'], name: { vi: 'dưa hấu', en: 'watermelon' } },
  { phrases: ['trái cây', 'hoa quả'], name: { vi: 'trái cây', en: 'fruit' } },
  { phrases: ['cơm'], name: { vi: 'cơm', en: 'rice' } },
  { phrases: ['phở'], name: { vi: 'phở', en: 'phở' } },
  { phrases: ['bún'], name: { vi: 'bún', en: 'noodles' } },
  { phrases: ['mì', 'mì tôm'], name: { vi: 'mì', en: 'noodles' } },
  { phrases: ['bánh mì'], name: { vi: 'bánh mì', en: 'bread' } },
  { phrases: ['bánh', 'bánh ngọt'], name: { vi: 'bánh', en: 'cake' } },
  { phrases: ['kẹo'], name: { vi: 'kẹo', en: 'candy' } },
  { phrases: ['kem'], name: { vi: 'kem', en: 'ice cream' } },
  { phrases: ['xôi'], name: { vi: 'xôi', en: 'sticky rice' } },
  { phrases: ['cháo'], name: { vi: 'cháo', en: 'porridge' } },
  { phrases: ['thịt'], name: { vi: 'thịt', en: 'meat' } },
  { phrases: ['cá'], name: { vi: 'cá', en: 'fish' } },
  { phrases: ['gà'], name: { vi: 'gà', en: 'chicken' } },
  { phrases: ['trứng'], name: { vi: 'trứng', en: 'eggs' } },
  { phrases: ['rau'], name: { vi: 'rau', en: 'vegetables' } },
  { phrases: ['sữa'], name: { vi: 'sữa', en: 'milk' } },
  { phrases: ['nước', 'nước lọc'], name: { vi: 'nước', en: 'water' } },
  { phrases: ['nước cam'], name: { vi: 'nước cam', en: 'orange juice' } },
  { phrases: ['cà phê', 'cafe', 'coffee'], name: { vi: 'cà phê', en: 'coffee' } },
  { phrases: ['trà', 'chè'], name: { vi: 'trà', en: 'tea' } },
  { phrases: ['trà sữa'], name: { vi: 'trà sữa', en: 'milk tea' } },
  { phrases: ['sinh tố'], name: { vi: 'sinh tố', en: 'a smoothie' } },
  { phrases: ['bia'], name: { vi: 'bia', en: 'beer' } },
  { phrases: ['sách'], name: { vi: 'sách', en: 'a book' } },
  { phrases: ['báo'], name: { vi: 'báo', en: 'the newspaper' } },
  { phrases: ['truyện'], name: { vi: 'truyện', en: 'a story' } },
  { phrases: ['bát', 'chén', 'bát đĩa', 'chén bát'], name: { vi: 'chén bát', en: 'the dishes' } },
  { phrases: ['quần áo', 'đồ'], name: { vi: 'quần áo', en: 'clothes' } },
  { phrases: ['nhà', 'nhà cửa'], name: { vi: 'nhà', en: 'the house' } },
  { phrases: ['xe', 'ô tô', 'xe hơi'], name: { vi: 'xe', en: 'a car' } },
  { phrases: ['xe đạp'], name: { vi: 'xe đạp', en: 'a bike' } },
  { phrases: ['xe máy'], name: { vi: 'xe máy', en: 'a motorbike' } },
  { phrases: ['cây'], name: { vi: 'cây', en: 'a tree' } },
  { phrases: ['hoa'], name: { vi: 'hoa', en: 'flowers' } },
  { phrases: ['bóng', 'quả bóng'], name: { vi: 'bóng', en: 'a ball' } },
  { phrases: ['điện thoại'], name: { vi: 'điện thoại', en: 'a phone' } },
  { phrases: ['thuốc'], name: { vi: 'thuốc', en: 'medicine' } },
  { phrases: ['kẹo mút'], name: { vi: 'kẹo mút', en: 'a lollipop' } },
]

/** Classifiers stripped before the object ("một quả chuối" → "chuối"). */
export const CLASSIFIERS = [
  'quả',
  'trái',
  'cái',
  'con',
  'ly',
  'cốc',
  'tách',
  'chén',
  'bát',
  'tô',
  'đĩa',
  'dĩa',
  'miếng',
  'chiếc',
  'cuốn',
  'quyển',
  'tờ',
  'lon',
  'chai',
  'gói',
  'hộp',
  'bình',
  'ổ',
  'nải',
  'buồng',
  'bữa',
  'ít',
  'chút',
] as const

/** Reminder labels a timer may carry ("nhắc tôi uống thuốc sau 30 phút"). Whitelisted, never free text. */
export const TIMER_LABELS = [
  'uống thuốc',
  'uống nước',
  'ăn cơm',
  'ăn trưa',
  'ăn tối',
  'nấu cơm',
  'tắt bếp',
  'đi ngủ',
  'ngủ trưa',
  'tập thể dục',
  'gọi điện',
  'đón cháu',
  'đón con',
  'tưới cây',
  'phơi đồ',
  'luộc trứng',
  'nấu ăn',
  'đi chợ',
  'uống trà',
  'nghỉ ngơi',
  'đo huyết áp',
  'xem tivi',
  'rút đồ',
  'tắt nồi',
  'làm bài tập',
  'thức dậy',
] as const
