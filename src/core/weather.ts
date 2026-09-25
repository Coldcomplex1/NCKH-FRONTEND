/** Normalized Open-Meteo result. Fetched by the engine (src/services/weather.ts). */
export interface WeatherDay {
  /** YYYY-MM-DD in Vietnam time */
  date: string
  code: number
  maxC: number
  minC: number
  /** 0–100, may be missing */
  precipProbability: number | null
}

export interface WeatherData {
  current: {
    tempC: number
    feelsLikeC: number
    humidity: number
    windKmh: number
    precipitationMm: number
    code: number
    isDay: boolean
  }
  /** Today, tomorrow, the day after (forecast_days=3). */
  daily: WeatherDay[]
  fetchedAt: number
}
