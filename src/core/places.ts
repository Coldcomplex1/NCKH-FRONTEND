import type { Bilingual } from './lang'

/** A resolved place for weather lookups. The parser fills lat/lon from its province gazetteer. */
export interface PlaceRef {
  /** Stable id: the ViMD province id, e.g. 'HoChiMinh', 'ThuaThienHue'. */
  id: string
  name: Bilingual
  lat: number
  lon: number
}

/** PTNK is in Ho Chi Minh City, so weather defaults there (no geolocation prompt, for privacy). */
export const DEFAULT_PLACE: PlaceRef = {
  /** Same id as the parser's gazetteer entry, so the weather cache is shared. */
  id: 'HoChiMinh',
  name: { vi: 'TP. Hồ Chí Minh', en: 'Ho Chi Minh City' },
  lat: 10.7769,
  lon: 106.7009,
}
