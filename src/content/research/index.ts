import { copyEn } from './copy.en'
import { copyVi } from './copy.vi'
import type { ResearchCopy } from './types'

export type * from './types'

/** Research copy per UI language; read it with `useDict(researchCopy)`. */
export const researchCopy: { vi: ResearchCopy; en: ResearchCopy } = { vi: copyVi, en: copyEn }
