import type { Bilingual } from '@/core/lang'

/**
 * Project facts shown on the site. Edit here — nothing else hard-codes them.
 * Empty values/lists hide their section automatically.
 */
export const project = {
  team: 'PTNK',
  /** The robot's name, used in its replies ("Mình là Ronaldo…"). */
  botName: 'Ronaldo',
  /** Short site name (header, <title>). PLACEHOLDER — confirm with the team. */
  siteName: { vi: 'Robot Hiểu Giọng Miền', en: 'Dialect-Aware Voice Robot' } satisfies Bilingual,
  title: {
    vi: 'Nâng cao chất lượng nhận dạng tiếng nói tiếng Việt đa phương ngữ: Kết hợp mô hình ASR tinh chỉnh trên bộ dữ liệu ViMD và mô-đun hiệu chỉnh hậu kỳ bằng mô hình ngôn ngữ lớn dùng để nhận diện phương ngữ vào các ứng dụng có giọng nói',
    en: 'Improving Multi-Dialect Vietnamese Speech Recognition: Combining ViMD Fine-Tuned ASR Models with an LLM-Based Post-Correction Module to identify dialects used in voice-recognition apps',
  } satisfies Bilingual,
  mentor: {
    name: { vi: 'Thầy Phạm Đức Đạt', en: 'Mr. Phạm Đức Đạt' } satisfies Bilingual,
    /**
     * Honorific + bare name, split out so the UI can render the Vietnamese name with lang="vi"
     * inside English copy (screen readers would otherwise read it with English phonetics).
     * Keep `name` above as the single full string for non-UI consumers (e.g. chat replies).
     */
    honorific: { vi: 'Thầy', en: 'Mr.' } satisfies Bilingual,
    personName: 'Phạm Đức Đạt',
    role: {
      // PLACEHOLDER translation — confirm the official Vietnamese title with the team.
      vi: 'Giáo viên Tin học – Chuyên viên Phòng Học vụ và Đảm bảo chất lượng giáo dục',
      en: 'Computer Science Teacher – Specialist, Office of Academic Affairs and Educational Quality',
    } satisfies Bilingual,
  },
  /** Team member names. PLACEHOLDER — the team section hides while this is empty. */
  members: [] as string[],
} as const
