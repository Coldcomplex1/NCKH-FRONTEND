import type { Bilingual } from './lang'

/** WMO weather interpretation codes (Open-Meteo `weather_code`) → short bilingual description. */
export type WeatherIcon = 'sun' | 'cloud-sun' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

interface WmoEntry {
  text: Bilingual
  icon: WeatherIcon
}

const TABLE: [codes: number[], entry: WmoEntry][] = [
  [[0], { text: { vi: 'trời quang đãng', en: 'clear sky' }, icon: 'sun' }],
  [[1], { text: { vi: 'trời ít mây', en: 'mainly clear' }, icon: 'cloud-sun' }],
  [[2], { text: { vi: 'có mây rải rác', en: 'partly cloudy' }, icon: 'cloud-sun' }],
  [[3], { text: { vi: 'trời nhiều mây, âm u', en: 'overcast' }, icon: 'cloud' }],
  [[45, 48], { text: { vi: 'có sương mù', en: 'fog' }, icon: 'fog' }],
  [[51, 53, 55], { text: { vi: 'có mưa phùn', en: 'drizzle' }, icon: 'drizzle' }],
  [[56, 57], { text: { vi: 'có mưa phùn lạnh', en: 'freezing drizzle' }, icon: 'drizzle' }],
  [[61], { text: { vi: 'có mưa nhỏ', en: 'light rain' }, icon: 'rain' }],
  [[63], { text: { vi: 'có mưa vừa', en: 'moderate rain' }, icon: 'rain' }],
  [[65], { text: { vi: 'có mưa to', en: 'heavy rain' }, icon: 'rain' }],
  [[66, 67], { text: { vi: 'có mưa lạnh', en: 'freezing rain' }, icon: 'rain' }],
  [[71, 73, 75, 77], { text: { vi: 'có tuyết', en: 'snow' }, icon: 'snow' }],
  [[80], { text: { vi: 'có mưa rào nhẹ', en: 'light showers' }, icon: 'rain' }],
  [[81], { text: { vi: 'có mưa rào', en: 'showers' }, icon: 'rain' }],
  [[82], { text: { vi: 'có mưa rào rất to', en: 'violent showers' }, icon: 'rain' }],
  [[85, 86], { text: { vi: 'có mưa tuyết', en: 'snow showers' }, icon: 'snow' }],
  [[95], { text: { vi: 'có dông', en: 'thunderstorm' }, icon: 'storm' }],
  [[96, 99], { text: { vi: 'có dông kèm mưa đá', en: 'thunderstorm with hail' }, icon: 'storm' }],
]

const BY_CODE = new Map<number, WmoEntry>(TABLE.flatMap(([codes, e]) => codes.map((c) => [c, e] as const)))
const UNKNOWN: WmoEntry = { text: { vi: 'thời tiết không rõ', en: 'unknown conditions' }, icon: 'cloud' }

export function describeWeatherCode(code: number): WmoEntry {
  return BY_CODE.get(code) ?? UNKNOWN
}
