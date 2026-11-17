import type { Bar } from './types'

type YahooChart = {
  chart: {
    result: Array<{
      meta: { regularMarketPrice: number; previousClose?: number; chartPreviousClose?: number }
      timestamp: number[]
      indicators: { quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }> }
    }> | null
    error?: { description?: string }
  }
}

function parseBars(payload: YahooChart): Bar[] {
  const result = payload.chart.result?.[0]
  if (!result) return []
  const quote = result.indicators.quote[0]
  const bars: Bar[] = []
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote.open[i]
    const high = quote.high[i]
    const low = quote.low[i]
    const close = quote.close[i]
    if ([open, high, low, close].some((v) => v == null || Number.isNaN(v))) continue
    bars.push({
      time: result.timestamp[i],
      open,
      high,
      low,
      close,
      volume: quote.volume[i] ?? 0,
    })
  }
  return bars
}

async function fetchYahoo(symbol: string, range = '60d', interval = '5m'): Promise<YahooChart> {
  const encoded = encodeURIComponent(symbol)
  const cached =
    symbol === '^VIX'
      ? interval === '1d'
        ? 'vix_daily.json'
        : 'vix.json'
      : 'spy.json'
  const paths = [
    `/api/yahoo/v8/finance/chart/${encoded}?interval=${interval}&range=${range}`,
    `/data/${cached}`,
  ]

  let lastError: unknown
  for (const path of paths) {
    try {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`${path} → ${res.status}`)
      return (await res.json()) as YahooChart
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to load market data')
}

export async function loadSpyBars(): Promise<{ bars: Bar[]; last: number; previousClose: number }> {
  const payload = await fetchYahoo('SPY')
  const result = payload.chart.result?.[0]
  const bars = parseBars(payload)
  return {
    bars,
    last: result?.meta.regularMarketPrice ?? bars.at(-1)?.close ?? 0,
    previousClose: result?.meta.previousClose ?? result?.meta.chartPreviousClose ?? 0,
  }
}

export async function loadVixLast(): Promise<number | null> {
  try {
    const payload = await fetchYahoo('^VIX')
    return payload.chart.result?.[0]?.meta.regularMarketPrice ?? null
  } catch {
    return null
  }
}

export async function loadVixDailyMap(): Promise<Record<string, number>> {
  try {
    const payload = await fetchYahoo('^VIX', '3mo', '1d')
    const result = payload.chart.result?.[0]
    const out: Record<string, number> = {}
    if (!result) return out
    const closes = result.indicators.quote[0].close
    for (let i = 0; i < result.timestamp.length; i++) {
      const c = closes[i]
      if (c == null || Number.isNaN(c)) continue
      out[nyDateKey(result.timestamp[i])] = c
    }
    return out
  } catch {
    return {}
  }
}

/** NY session date key like 2026-11-17 */
export function nyDateKey(unixSec: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSec * 1000))
}

export function nyMinutesSinceMidnight(unixSec: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(unixSec * 1000))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

export function groupBySession(bars: Bar[]): Record<string, Bar[]> {
  const map: Record<string, Bar[]> = {}
  for (const bar of bars) {
    const mins = nyMinutesSinceMidnight(bar.time)
    // RTH roughly 9:30–16:00 ET
    if (mins < 9 * 60 + 30 || mins >= 16 * 60) continue
    const key = nyDateKey(bar.time)
    ;(map[key] ??= []).push(bar)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.time - b.time)
  }
  return map
}
