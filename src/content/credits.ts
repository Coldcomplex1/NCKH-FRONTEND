import type { Bilingual } from '@/core/lang'

/**
 * Third-party works used by the site, with their licences. Rendered by the research "credits" section.
 * Keep the Open-Meteo link text EXACTLY "Weather data by Open-Meteo.com" (their attribution requirement).
 */

export interface Licence {
  name: string
  url: string
}

export interface CreditEntry {
  id: string
  /** Name of the work (a plain string when it is not translated). */
  name: string | Bilingual
  /** What the site uses it for. */
  role: Bilingual
  /** Author / publisher line. */
  by: Bilingual
  /** Set when `by` is a Vietnamese name, so screen readers pronounce it correctly in the EN UI. */
  byLang?: 'vi'
  /** null = no licence stated yet (shown as a note). */
  licence: Licence | null
  /** Project / source page. */
  url?: string
  /** Visible text for `url` when the licensor prescribes it. */
  linkText?: string
  /**
   * Shown in place of the generic "no licence stated" fallback when `licence` is null but the
   * source does state specific usage terms (just not as a named/SPDX licence).
   */
  licenceNote?: Bilingual
  note?: Bilingual
  /** Plain-text citation, as the source asks to be cited. */
  citation?: string
}

const CC0: Licence = { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }
const CC_BY: Licence = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }
const CC_BY_NC_ND: Licence = {
  name: 'CC BY-NC-ND 4.0',
  url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
}
const BSD3: Licence = { name: 'BSD-3-Clause', url: 'https://opensource.org/license/bsd-3-clause' }
const MIT: Licence = { name: 'MIT', url: 'https://opensource.org/license/mit' }
const OFL: Licence = { name: 'SIL OFL 1.1', url: 'https://openfontlicense.org/' }
const ISC: Licence = { name: 'ISC', url: 'https://lucide.dev/license' }

export const credits: CreditEntry[] = [
  {
    id: 'vimd',
    name: 'ViMD — Vietnamese Multi-Dialect Dataset',
    role: { vi: 'Bộ dữ liệu huấn luyện và đánh giá', en: 'Training and evaluation dataset' },
    by: { vi: 'Dinh và cộng sự (EMNLP 2024)', en: 'Dinh et al. (EMNLP 2024)' },
    licence: CC_BY_NC_ND,
    url: 'https://huggingface.co/datasets/nguyendv02/ViMD_Dataset',
    note: {
      vi: 'Trang này chỉ trích vài câu chép lời để phân tích lỗi và không lưu trữ âm thanh của bộ dữ liệu.',
      en: 'This page quotes a few transcripts for error analysis only and hosts none of the dataset audio.',
    },
    citation:
      'Nguyen Dinh, Thanh Dang, Luan Thanh Nguyen, and Kiet Nguyen. 2024. Multi-Dialect Vietnamese: Task, Dataset, Baseline Models and Challenges. In Proceedings of the 2024 Conference on Empirical Methods in Natural Language Processing, pages 7476–7498, Miami, Florida, USA. Association for Computational Linguistics. https://aclanthology.org/2024.emnlp-main.426',
  },
  {
    id: 'phowhisper',
    name: 'PhoWhisper',
    role: { vi: 'Mô hình nhận dạng tiếng nói gốc', en: 'Base speech-recognition model' },
    by: { vi: 'VinAI Research', en: 'VinAI Research' },
    licence: BSD3,
    url: 'https://github.com/VinAIResearch/PhoWhisper',
    citation:
      'Thanh-Thien Le, Linh The Nguyen, and Dat Quoc Nguyen. 2024. PhoWhisper: Automatic Speech Recognition for Vietnamese. In Proceedings of the ICLR 2024 Tiny Papers track.',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    role: {
      vi: 'Mô hình ngôn ngữ lớn cho bước hiệu chỉnh hậu kỳ (sắp có)',
      en: 'Large language model for post-correction (coming soon)',
    },
    by: { vi: 'Nhóm Qwen, Alibaba Cloud', en: 'Qwen team, Alibaba Cloud' },
    licence: null,
    url: 'https://github.com/QwenLM',
    note: {
      vi: 'Giấy phép sẽ được bổ sung khi nhóm chọn phiên bản mô hình.',
      en: 'The licence will be added once the model version is chosen.',
    },
  },
  {
    id: 'robot',
    name: 'RobotExpressive',
    role: { vi: 'Mô hình robot 3D (Ronaldo)', en: '3D robot model (Ronaldo)' },
    by: {
      vi: 'Tomás Laulhé (Quaternius); Don McCurdy chỉnh sửa; lấy từ bộ ví dụ của three.js',
      en: 'Tomás Laulhé (Quaternius), modifications by Don McCurdy; via the three.js examples',
    },
    licence: CC0,
    url: 'https://threejs.org/examples/#webgl_animation_skinning_morph',
  },
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    role: { vi: 'Dữ liệu thời tiết', en: 'Weather data' },
    by: { vi: 'Open-Meteo.com', en: 'Open-Meteo.com' },
    licence: CC_BY,
    url: 'https://open-meteo.com/',
    linkText: 'Weather data by Open-Meteo.com',
  },
  {
    id: 'lunar',
    name: { vi: 'Thuật toán âm lịch Việt Nam', en: 'Vietnamese lunar calendar algorithm' },
    role: { vi: 'Đổi ngày dương lịch sang âm lịch', en: 'Solar-to-lunar calendar conversion' },
    by: { vi: 'Hồ Ngọc Đức', en: 'Hồ Ngọc Đức' },
    byLang: 'vi',
    licence: null,
    // Original site is gone (404); linking the Wayback Machine's archived copy instead.
    url: 'https://web.archive.org/web/2024/https://www.informatik.uni-leipzig.de/~duc/amlich/',
    licenceNote: {
      vi: '© 2006 Hồ Ngọc Đức — dùng cho mục đích cá nhân, phi thương mại, với điều kiện giữ nguyên thông báo bản quyền.',
      en: '© 2006 Hồ Ngọc Đức — personal, non-commercial use permitted provided the copyright notice is kept.',
    },
    note: {
      vi: 'Thuật toán thiên văn theo Jean Meeus, "Astronomical Algorithms" (1998).',
      en: 'Algorithms after Jean Meeus, "Astronomical Algorithms" (1998).',
    },
  },
  {
    id: 'libraries',
    name: 'three.js · React · React Three Fiber · drei · zustand · Tailwind CSS',
    role: { vi: 'Thư viện dựng giao diện và cảnh 3D', en: 'UI and 3D rendering libraries' },
    by: { vi: 'Các tác giả của từng dự án', en: 'Their respective authors' },
    licence: MIT,
  },
  {
    id: 'fonts',
    name: 'Be Vietnam Pro · Nunito',
    role: { vi: 'Phông chữ', en: 'Typefaces' },
    by: {
      vi: 'Các nhà thiết kế của từng phông (phân phối qua Fontsource)',
      en: 'Their designers (distributed via Fontsource)',
    },
    licence: OFL,
  },
  {
    id: 'lucide',
    name: 'Lucide',
    role: { vi: 'Bộ biểu tượng', en: 'Icon set' },
    by: { vi: 'Cộng đồng Lucide', en: 'Lucide contributors' },
    licence: ISC,
    url: 'https://lucide.dev/',
  },
]

/** Path of the full (English) technical report republished from the training run. */
export const REPORT_URL = '/reports/run-results-dashboard.html'
