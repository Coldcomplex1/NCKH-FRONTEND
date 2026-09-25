import { useMediaQuery } from '@/lib/hooks'
import { usePrefs } from '@/store/prefsStore'

/** Soft-pop pastel palette for the diorama. Dark theme = "evening in the same room". */
export interface ScenePalette {
  floor: string
  floorEdge: string
  plank: string
  backWall: string
  leftWall: string
  wainscot: string
  trim: string
  rug: string
  rugBorder: string
  rugDots: string
  shelf: string
  books: readonly string[]
  pot: string
  leaf: string
  leafDark: string
  clockRim: string
  clockFace: string
  clockHand: string
  clockSecond: string
  lampMetal: string
  lampShade: string
  bulbOff: string
  fanBody: string
  fanAccent: string
  fanBlade: string
  frame: string
  shadow: string
  shadowOpacity: number
  /** Hemisphere light: sky / ground colours and intensity with the lamp off. */
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  keyIntensity: number
  keyColor: string
  /** How much the lamp adds (dark rooms profit more). */
  lampBoost: number
}

const BOOKS = ['#FF8FA3', '#7FD1C7', '#FFD166', '#9DB4FF', '#C8A2FF', '#FFB38A'] as const

export const LIGHT_PALETTE: ScenePalette = {
  floor: '#F7DDBE',
  floorEdge: '#E4B98C',
  plank: '#EFCBA3',
  backWall: '#FFE4EA',
  leftWall: '#FFF0DC',
  wainscot: '#FFD3DD',
  trim: '#FFFFFF',
  rug: '#CFC8FF',
  rugBorder: '#A89BFF',
  rugDots: '#FFFFFF',
  shelf: '#FFFFFF',
  books: BOOKS,
  pot: '#FF9E80',
  leaf: '#6CC58A',
  leafDark: '#48A56B',
  clockRim: '#7C6CF0',
  clockFace: '#FFFFFF',
  clockHand: '#3A2F6B',
  clockSecond: '#FF6F91',
  lampMetal: '#6A5ACD',
  lampShade: '#FFF3D1',
  bulbOff: '#F2EEE6',
  fanBody: '#FFFFFF',
  fanAccent: '#7FB8FF',
  fanBlade: '#B9DCFF',
  frame: '#FFFFFF',
  shadow: '#2B2150',
  shadowOpacity: 0.26,
  hemiSky: '#FFFFFF',
  hemiGround: '#F3D9C4',
  hemiIntensity: 1.6,
  keyIntensity: 2.4,
  keyColor: '#FFF6EC',
  lampBoost: 0.35,
}

export const DARK_PALETTE: ScenePalette = {
  floor: '#5A4C80',
  floorEdge: '#3F3462',
  plank: '#51446F',
  backWall: '#453D78',
  leftWall: '#4E4585',
  wainscot: '#3B3468',
  trim: '#6D63A8',
  rug: '#7466D6',
  rugBorder: '#9486F0',
  rugDots: '#C9C0FF',
  shelf: '#6D63A8',
  books: BOOKS,
  pot: '#E88A6E',
  leaf: '#5DB37C',
  leafDark: '#3F8C5C',
  clockRim: '#A996FF',
  clockFace: '#EDEAFF',
  clockHand: '#2A2350',
  clockSecond: '#FF6F91',
  lampMetal: '#A996FF',
  lampShade: '#FFF3D1',
  bulbOff: '#CFCBE0',
  fanBody: '#E9E6FF',
  fanAccent: '#7FB8FF',
  fanBlade: '#B9DCFF',
  frame: '#8C82C8',
  shadow: '#0B0820',
  shadowOpacity: 0.42,
  hemiSky: '#C9C4FF',
  hemiGround: '#3A3160',
  hemiIntensity: 0.75,
  keyIntensity: 0.7,
  keyColor: '#D9D4FF',
  lampBoost: 0.6,
}

/** The resolved theme: the user's choice, or the system setting for 'system'. */
export function useSceneDark(): boolean {
  const theme = usePrefs((s) => s.theme)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  return theme === 'dark' || (theme === 'system' && systemDark)
}

export const paletteFor = (dark: boolean): ScenePalette => (dark ? DARK_PALETTE : LIGHT_PALETTE)
