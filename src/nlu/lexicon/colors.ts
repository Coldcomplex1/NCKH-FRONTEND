import type { ColorId } from '@/core/colors'

/**
 * Light colours → core ColorId (spec §4.3, trimmed to the lamp's 10 colours). Each phrase may be
 * preceded by "màu". Longest match wins, so "xanh lá" is never read as plain "xanh".
 * `black` means "turn the light off" (note black_is_off); plain "xanh" is teal + note xanh_ambiguous.
 */
export type ColorValue = ColorId | 'black'

export interface ColorEntry {
  phrases: readonly string[]
  value: ColorValue
  ambiguous?: boolean
}

export const COLORS: readonly ColorEntry[] = [
  {
    value: 'blue',
    phrases: [
      'xanh dương',
      'xanh lam',
      'lam',
      'xanh biển',
      'xanh nước biển',
      'xanh da trời',
      'xanh trời',
      'xanh lơ đậm',
    ],
  },
  { value: 'green', phrases: ['xanh lá', 'xanh lá cây', 'xanh lục', 'xanh két', 'xanh cây'] },
  { value: 'teal', phrases: ['xanh ngọc', 'xanh lơ', 'ngọc'] },
  { value: 'teal', phrases: ['xanh'], ambiguous: true },
  { value: 'red', phrases: ['đỏ', 'đỏ tươi'] },
  { value: 'orange', phrases: ['cam'] },
  { value: 'warm', phrases: ['vàng ấm', 'trắng ấm', 'ấm', 'ánh vàng'] },
  { value: 'yellow', phrases: ['vàng', 'vàng chanh'] },
  { value: 'white', phrases: ['trắng', 'trắng tinh'] },
  // "tía" alone is Southern for father: the colour only as "màu tía"
  { value: 'purple', phrases: ['tím', 'màu tía'] },
  { value: 'pink', phrases: ['hồng'] },
  { value: 'black', phrases: ['đen'] },
]
