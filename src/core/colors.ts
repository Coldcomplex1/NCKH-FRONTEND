import type { Bilingual } from './lang'

/** Light colours the robot's lamp supports. Shared by the parser (slot values) and the 3D room. */
export type ColorId =
  'warm' | 'white' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink'

export interface LightColor {
  id: ColorId
  name: Bilingual
  /** sRGB hex used for the bulb emissive and the point light. */
  hex: string
}

export const LIGHT_COLORS: Record<ColorId, LightColor> = {
  warm: { id: 'warm', name: { vi: 'vàng ấm', en: 'warm white' }, hex: '#FFC47A' },
  white: { id: 'white', name: { vi: 'trắng', en: 'white' }, hex: '#FFFFFF' },
  red: { id: 'red', name: { vi: 'đỏ', en: 'red' }, hex: '#FF3B30' },
  orange: { id: 'orange', name: { vi: 'cam', en: 'orange' }, hex: '#FF8A1F' },
  yellow: { id: 'yellow', name: { vi: 'vàng', en: 'yellow' }, hex: '#FFD60A' },
  green: { id: 'green', name: { vi: 'xanh lá', en: 'green' }, hex: '#34C759' },
  // Plain "xanh" is ambiguous (green or blue): the robot uses teal and asks which one.
  teal: { id: 'teal', name: { vi: 'xanh ngọc', en: 'teal' }, hex: '#00B3A6' },
  blue: { id: 'blue', name: { vi: 'xanh dương', en: 'blue' }, hex: '#2F7BFF' },
  purple: { id: 'purple', name: { vi: 'tím', en: 'purple' }, hex: '#A259FF' },
  pink: { id: 'pink', name: { vi: 'hồng', en: 'pink' }, hex: '#FF6FB5' },
}
